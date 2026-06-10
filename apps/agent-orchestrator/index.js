// apps/agent-orchestrator/index.js
// Cloud Function that orchestrates the agent reasoning loop
// Invoked by webhook-receiver, manages agent state and tool execution

const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

// Initialize Firebase Admin with explicit project ID
const projectId = (process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
initializeApp({
  projectId: projectId
});
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Agent Reasoning Orchestrator ─────────────────────────────────────
// This orchestrator manages the 5-phase reasoning loop:
// Observe → Correlate → Hypothesize → Recommend → Execute & Verify

exports.runReasoningLoop = onRequest(async (req, res) => {
  // Handle HTTP request
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { incidentId, problemId } = req.body.data || req.body;

  if (!incidentId || !problemId) {
    throw new Error("incidentId and problemId are required");
  }

  try {
    // Get incident from Firestore
    const incidentRef = db.collection("incidents").doc(incidentId);
    const incident = await incidentRef.get();

    if (!incident.exists) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    let data = incident.data();

    // Initialize reasoning state if not present
    if (!data.reasoningState) {
      await incidentRef.update({
        reasoningState: {
          phase: "observe",
          toolCallCount: 0,
          startedAt: FieldValue.serverTimestamp(),
        },
      });
      data.reasoningState = {
        phase: "observe",
        toolCallCount: 0,
        startedAt: new Date(),
      };
    }

    // Execute all 5 phases in sequence
    const phases = ["observe", "correlate", "hypothesize", "recommend"];
    const results = {};

    for (const phase of phases) {
      console.log(`[orchestrator] Executing phase: ${phase}`);
      const result = await executePhase(incidentId, problemId, phase, data);
      results[phase] = result;

      // Refresh incident data for next phase
      const updatedIncident = await incidentRef.get();
      data = updatedIncident.data();
    }

    return res.status(200).json({ success: true, phases: Object.keys(results), results });
  } catch (error) {
    console.error("[orchestrator] error:", error);

    // Write error to Firestore
    try {
      await db.collection("incidents").doc(incidentId).collection("steps").add({
        phase: "error",
        label: "Agent error occurred",
        content: `Error: ${error.message}`,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      console.error("[orchestrator] Failed to write error to Firestore:", firestoreError);
    }

    return res.status(500).json({ error: error.message });
  }
});

// ─── Phase Execution ──────────────────────────────────────────────────

async function executePhase(incidentId, problemId, phase, incidentData) {
  const incidentRef = db.collection("incidents").doc(incidentId);

  switch (phase) {
    case "observe":
      return await observePhase(incidentId, problemId, incidentRef);

    case "correlate":
      return await correlatePhase(incidentId, problemId, incidentRef, incidentData);

    case "hypothesize":
      return await hypothesizePhase(incidentId, incidentRef, incidentData);

    case "recommend":
      return await recommendPhase(incidentId, incidentRef, incidentData);

    case "execute":
      return await executePhase_action(incidentId, incidentRef, incidentData);

    case "verify":
      return await verifyPhase(incidentId, problemId, incidentRef);

    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

// ─── Phase 1: Observe ─────────────────────────────────────────────────

async function observePhase(incidentId, problemId, incidentRef) {
  // Write reasoning step
  await writeStep(incidentId, {
    phase: "observe",
    label: "Starting observation phase",
    content: `Pulling problem context from Dynatrace for problem ${problemId}`,
  });

  // Call Dynatrace tools
  const problemDetails = await callDynatraceTool("get_problem_details", { problemId });
  const affectedEntities = await callDynatraceTool("get_affected_entities", { problemId });

  // Extract primary entity (service)
  const primaryEntity = affectedEntities.entities?.[0];

  // Query metrics
  const metrics = primaryEntity
    ? await queryMetricsForEntity(primaryEntity.entityId, problemDetails.startTime)
    : { errorRate: 0, p99Latency: 0, requestsPerMin: 0 };

  // Fetch error logs
  const logs = primaryEntity
    ? await callDynatraceTool("fetch_logs", {
        entityId: primaryEntity.entityId,
        from: problemDetails.startTime,
        to: "now",
        filter: "ERROR",
      })
    : { logs: [] };

  // Update incident with observed data
  const logLines = logs.logs || [];
  await incidentRef.update({
    affectedEntities: affectedEntities.entities || [],
    metrics,
    observedLogs: logLines.slice(0, 20), // Max 20 lines
    "reasoningState.phase": "correlate",
    "reasoningState.toolCallCount": FieldValue.increment(4),
  });

  // Write completion step
  await writeStep(incidentId, {
    phase: "observe",
    label: "Observation complete",
    content: `Found ${affectedEntities.entities?.length || 0} affected entities. Error rate: ${metrics.errorRate}%, p99 latency: ${metrics.p99Latency}ms. Captured ${logLines.length} error log lines.`,
    toolCalls: [
      { name: "get_problem_details", result: "Success" },
      { name: "get_affected_entities", result: `${affectedEntities.entities?.length || 0} entities` },
      { name: "query_metrics", result: "3 metrics" },
      { name: "fetch_logs", result: `${logLines.length} lines` },
    ],
    logLines: logLines.slice(0, 10).map(l => l.content || l),
  });

  return { metrics, entities: affectedEntities.entities, logCount: logLines.length };
}

// ─── Phase 2: Correlate ───────────────────────────────────────────────

async function correlatePhase(incidentId, problemId, incidentRef, incidentData) {
  await writeStep(incidentId, {
    phase: "correlate",
    label: "Correlating with recent deploys",
    content: "Scanning GitHub for commits deployed within 30 minutes of incident start",
  });

  // Get affected service name
  const serviceName = incidentData.affectedEntities?.[0]?.name || incidentData.service;

  // List recent commits
  const commits = await callGitHubTool("list_recent_commits", {
    owner: process.env.GITHUB_REPO_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    branch: "main",
    hoursBack: 24,
  });

  // Filter commits within 30 minutes of incident start
  const incidentStartTime = incidentData.startedAt?.toDate?.() || new Date();
  const suspectCommits = commits.commits?.filter((commit) => {
    const commitTime = new Date(commit.timestamp);
    const timeDiff = (incidentStartTime - commitTime) / 1000 / 60; // minutes
    return timeDiff >= 0 && timeDiff <= 30;
  }) || [];

  // Get diffs for suspect commits
  const commitDiffs = [];
  for (const commit of suspectCommits.slice(0, 3)) {
    // Max 3 commits
    const diff = await callGitHubTool("get_commit_diff", {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      sha: commit.fullSha,
    });
    commitDiffs.push({ commit: commit.sha, diff });
  }

  // Update incident
  await incidentRef.update({
    suspectCommits,
    commitDiffs,
    "reasoningState.phase": "hypothesize",
    "reasoningState.toolCallCount": FieldValue.increment(1 + commitDiffs.length),
  });

  await writeStep(incidentId, {
    phase: "correlate",
    label: "Correlation complete",
    content: `Found ${commits.commits?.length || 0} commits in the past 24 hours. ${suspectCommits.length} commits deployed within 30 minutes of incident start: ${suspectCommits.map((c) => c.sha).join(", ")}.`,
    toolCalls: [
      { name: "list_recent_commits", result: `${commits.commits?.length} commits` },
      ...commitDiffs.map((d) => ({ name: "get_commit_diff", result: `${d.diff.files?.length} files` })),
    ],
  });

  return { totalCommits: commits.commits?.length, suspectCommits: suspectCommits.length };
}

// ─── Phase 3: Hypothesize ─────────────────────────────────────────────

async function hypothesizePhase(incidentId, incidentRef, incidentData) {
  await writeStep(incidentId, {
    phase: "hypothesize",
    label: "Forming hypothesis",
    content: "Analyzing all evidence to determine root cause",
  });

  // Analyze evidence (simple heuristic for now - can be enhanced with LLM)
  const suspectCommits = incidentData.suspectCommits || [];
  const metrics = incidentData.metrics || {};
  const logs = incidentData.observedLogs || [];

  let hypothesis = {
    suspect: null,
    confidence: "low",
    evidence: [],
    alternativeExplanation: null,
  };

  // Rule 1: High error rate + recent commit = likely bad deploy
  if (metrics.errorRate > 5 && suspectCommits.length > 0) {
    const primarySuspect = suspectCommits[0];
    hypothesis = {
      suspect: primarySuspect.sha,
      confidence: "high",
      evidence: [
        `Error rate spiked to ${metrics.errorRate}% at incident start`,
        `Commit ${primarySuspect.sha} deployed ${Math.round((new Date(incidentData.startedAt?.toDate?.()) - new Date(primarySuspect.timestamp)) / 1000 / 60)} minutes before incident`,
        `Affected service: ${incidentData.service}`,
      ],
      alternativeExplanation: "External dependency failure (check service dependencies)",
    };
  }
  // Rule 2: High latency + no recent commits = likely external or load issue
  else if (metrics.p99Latency > 2000 && suspectCommits.length === 0) {
    hypothesis = {
      suspect: "external-dependency-or-load",
      confidence: "medium",
      evidence: [
        `p99 latency increased to ${metrics.p99Latency}ms`,
        `No recent deploys found`,
        `Request volume: ${metrics.requestsPerMin} req/min`,
      ],
      alternativeExplanation: "Database performance degradation",
    };
  }
  // Rule 3: Fallback - low confidence
  else {
    hypothesis = {
      suspect: "unknown",
      confidence: "low",
      evidence: [
        `Error rate: ${metrics.errorRate}%`,
        `p99 latency: ${metrics.p99Latency}ms`,
        `${suspectCommits.length} recent commits found`,
      ],
      alternativeExplanation: "Insufficient data - requires manual investigation",
    };
  }

  // Update incident
  await incidentRef.update({
    hypothesis,
    "reasoningState.phase": "recommend",
  });

  await writeStep(incidentId, {
    phase: "hypothesize",
    label: `Hypothesis formed (${hypothesis.confidence} confidence)`,
    content: `Primary suspect: ${hypothesis.suspect}. Evidence:\n${hypothesis.evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\nAlternative explanation: ${hypothesis.alternativeExplanation}`,
  });

  return { hypothesis };
}

// ─── Phase 4: Recommend ───────────────────────────────────────────────

async function recommendPhase(incidentId, incidentRef, incidentData) {
  const hypothesis = incidentData.hypothesis;

  let recommendation = {
    action: "ESCALATE",
    description: "Hand off to on-call engineer with full context",
    requiresApproval: false,
  };

  // Map hypothesis to action
  if (hypothesis.confidence === "high" && hypothesis.suspect && hypothesis.suspect !== "unknown") {
    recommendation = {
      action: "ROLLBACK",
      description: `Revert commit ${hypothesis.suspect}`,
      targetCommit: hypothesis.suspect,
      requiresApproval: true,
    };
  } else if (hypothesis.confidence === "medium") {
    recommendation = {
      action: "ESCALATE",
      description: `Investigation needed: ${hypothesis.alternativeExplanation}`,
      requiresApproval: false,
    };
  }

  // Update incident
  await incidentRef.update({
    recommendation,
    approvalStatus: recommendation.requiresApproval ? "pending" : null,
    "reasoningState.phase": recommendation.requiresApproval ? "waiting" : "escalated",
  });

  // Post to Slack (if configured)
  if (recommendation.requiresApproval && process.env.SLACK_WEBHOOK_URL) {
    await postToSlack(incidentId, incidentData, hypothesis, recommendation);
  }

  await writeStep(incidentId, {
    phase: "recommend",
    label: `Recommendation: ${recommendation.action}`,
    content: `Action: ${recommendation.action}\nDescription: ${recommendation.description}\nRequires approval: ${recommendation.requiresApproval}`,
  });

  if (recommendation.requiresApproval) {
    await writeStep(incidentId, {
      phase: "waiting",
      label: "Waiting for human approval",
      content: "Incident summary posted to Slack. Awaiting approval before executing rollback.",
    });
  }

  return { recommendation };
}

// ─── Phase 5: Execute ─────────────────────────────────────────────────

async function executePhase_action(incidentId, incidentRef, incidentData) {
  const approvalStatus = incidentData.approvalStatus;

  if (approvalStatus === "rejected") {
    await writeStep(incidentId, {
      phase: "execute",
      label: "Action rejected",
      content: "Human rejected the recommendation. Escalating to on-call engineer.",
    });

    await incidentRef.update({
      status: "escalated",
      "reasoningState.phase": "complete",
    });

    return { executed: false, reason: "rejected" };
  }

  if (approvalStatus !== "approved") {
    throw new Error("Cannot execute without approval");
  }

  // Execute the action
  const recommendation = incidentData.recommendation;

  if (recommendation.action === "ROLLBACK") {
    await writeStep(incidentId, {
      phase: "execute",
      label: "Executing rollback",
      content: `Reverting commit ${recommendation.targetCommit}`,
    });

    try {
      const revertResult = await callGitHubTool("revert_commit", {
        owner: process.env.GITHUB_REPO_OWNER,
        repo: process.env.GITHUB_REPO_NAME,
        sha: recommendation.targetCommit,
        branch: "main",
        incidentId,
      });

      await incidentRef.update({
        revertCommit: revertResult.revertSha,
        "reasoningState.phase": "verify",
      });

      await writeStep(incidentId, {
        phase: "execute",
        label: "Rollback complete",
        content: `Reverted commit ${recommendation.targetCommit}. Revert commit: ${revertResult.revertSha}. Cloud Run will deploy automatically.`,
      });

      return { executed: true, revertSha: revertResult.revertSha };
    } catch (error) {
      await writeStep(incidentId, {
        phase: "execute",
        label: "Rollback failed",
        content: `Error executing rollback: ${error.message}`,
      });

      await incidentRef.update({
        status: "escalated",
        "reasoningState.phase": "complete",
      });

      return { executed: false, error: error.message };
    }
  }

  return { executed: false, reason: "no-action" };
}

// ─── Phase 6: Verify ──────────────────────────────────────────────────

async function verifyPhase(incidentId, problemId, incidentRef) {
  await writeStep(incidentId, {
    phase: "verify",
    label: "Verifying resolution",
    content: "Monitoring Dynatrace for problem resolution",
  });

  // Check if problem is resolved
  const problemDetails = await callDynatraceTool("get_problem_details", { problemId });

  if (problemDetails.state === "RESOLVED" || problemDetails.state === "CLOSED") {
    await incidentRef.update({
      status: "resolved",
      resolvedAt: FieldValue.serverTimestamp(),
      "reasoningState.phase": "complete",
    });

    await writeStep(incidentId, {
      phase: "verify",
      label: "Incident resolved",
      content: `Dynatrace problem ${problemId} marked as ${problemDetails.state}. Incident successfully resolved.`,
    });

    return { resolved: true };
  }

  // Still active - continue monitoring
  await writeStep(incidentId, {
    phase: "verify",
    label: "Still monitoring",
    content: `Problem still active. Will check again in 60 seconds.`,
  });

  return { resolved: false, willRetry: true };
}

// ─── Helper Functions ─────────────────────────────────────────────────

async function writeStep(incidentId, step) {
  await db
    .collection("incidents")
    .doc(incidentId)
    .collection("steps")
    .add({
      ...step,
      createdAt: FieldValue.serverTimestamp(),
    });
}

async function callDynatraceTool(toolName, params) {
  // Call the Dynatrace Tools API (Cloud Run service)
  const TOOLS_URL = process.env.DYNATRACE_TOOLS_URL ||
    "https://devpulse-dynatrace-tools-713434268138.us-central1.run.app";

  try {
    console.log(`[dynatrace] Calling ${toolName} with params:`, params);

    const response = await fetch(`${TOOLS_URL}/${toolName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dynatrace tool ${toolName} failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`[dynatrace] ${toolName} result:`, result);
    return result;
  } catch (error) {
    console.error(`[dynatrace] Error calling ${toolName}:`, error.message);
    // Return safe defaults on error to prevent orchestrator from crashing
    switch (toolName) {
      case "get_problem_details":
        return {
          problemId: params.problemId,
          title: "Unknown problem",
          severity: "ERROR",
          startTime: new Date().toISOString(),
          state: "OPEN",
        };
      case "get_affected_entities":
        return { entities: [], totalCount: 0 };
      case "fetch_logs":
        return { logs: [], totalCount: 0 };
      default:
        return {};
    }
  }
}

async function callGitHubTool(toolName, params) {
  // Call GitHub API directly
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const BASE_URL = "https://api.github.com";

  if (!GITHUB_TOKEN) {
    console.error("[github] No GITHUB_TOKEN configured");
    return { error: "GITHUB_TOKEN not configured" };
  }

  try {
    console.log(`[github] Calling ${toolName} with params:`, params);

    if (toolName === "list_recent_commits") {
      const { owner, repo, branch = "main", hoursBack = 24 } = params;
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

      const response = await fetch(
        `${BASE_URL}/repos/${owner}/${repo}/commits?sha=${branch}&since=${since}&per_page=20`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
      }

      const commits = await response.json();
      const filtered = commits
        .filter((c) => !c.commit.message.startsWith("Merge"))
        .map((c) => ({
          sha: c.sha.slice(0, 7),
          fullSha: c.sha,
          message: c.commit.message.split("\n")[0],
          author: c.commit.author.name,
          timestamp: c.commit.author.date,
          url: c.html_url,
        }));

      return { commits: filtered, count: filtered.length };
    }

    if (toolName === "get_commit_diff") {
      const { owner, repo, sha } = params;

      const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/commits/${sha}`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
      }

      const commit = await response.json();
      const files = (commit.files || []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? "(binary or too large)",
      }));

      return {
        sha: commit.sha.slice(0, 7),
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        files,
      };
    }

    if (toolName === "revert_commit") {
      const { owner, repo, sha, branch = "main", incidentId } = params;

      // Safety gate: verify approval in Firestore
      const snap = await db.collection("incidents").doc(incidentId).get();
      if (!snap.exists) {
        throw new Error(`Incident ${incidentId} not found in Firestore`);
      }
      const { approvalStatus } = snap.data();
      if (approvalStatus !== "approved") {
        throw new Error(
          `Approval required. Current status: "${approvalStatus}". Must be "approved".`
        );
      }

      // Get the commit to revert
      const targetResponse = await fetch(`${BASE_URL}/repos/${owner}/${repo}/commits/${sha}`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!targetResponse.ok) {
        throw new Error(`GitHub API error: ${targetResponse.status}`);
      }

      const target = await targetResponse.json();

      // Get current HEAD
      const headResponse = await fetch(`${BASE_URL}/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!headResponse.ok) {
        throw new Error(`GitHub API error: ${headResponse.status}`);
      }

      const currentHead = await headResponse.json();
      const currentHeadSha = currentHead.object.sha;

      // Get the tree to revert to (parent of the bad commit)
      const revertTree = target.parents[0]
        ? (await (await fetch(`${BASE_URL}/repos/${owner}/${repo}/commits/${target.parents[0].sha}`, {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          })).json()).commit.tree.sha
        : target.commit.tree.sha;

      // Create revert commit
      const commitResponse = await fetch(`${BASE_URL}/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `revert: Revert "${target.commit.message.split("\n")[0]}"\n\nDevPulse automated rollback. Incident: ${incidentId}`,
          tree: revertTree,
          parents: [currentHeadSha],
        }),
      });

      if (!commitResponse.ok) {
        throw new Error(`GitHub API error: ${commitResponse.status} ${await commitResponse.text()}`);
      }

      const newCommit = await commitResponse.json();

      // Update branch reference
      const updateResponse = await fetch(`${BASE_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sha: newCommit.sha }),
      });

      if (!updateResponse.ok) {
        throw new Error(`GitHub API error: ${updateResponse.status} ${await updateResponse.text()}`);
      }

      return {
        ok: true,
        revertSha: newCommit.sha.slice(0, 7),
        fullSha: newCommit.sha,
        message: "Revert commit pushed. Cloud Build will deploy automatically.",
      };
    }

    return { error: `Unknown GitHub tool: ${toolName}` };
  } catch (error) {
    console.error(`[github] Error calling ${toolName}:`, error.message);
    return { error: error.message, commits: [], files: [] };
  }
}

async function queryMetricsForEntity(entityId, startTime) {
  // Placeholder - queries Dynatrace metrics API
  console.log(`[metrics] entityId=${entityId}, startTime=${startTime}`);

  return {
    errorRate: 12.5,
    p99Latency: 3500,
    requestsPerMin: 150,
  };
}

async function postToSlack(incidentId, incidentData, hypothesis, recommendation) {
  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

  if (!SLACK_WEBHOOK_URL) {
    console.log(`[slack] No SLACK_WEBHOOK_URL configured, skipping Slack notification`);
    return null;
  }

  console.log(`[slack] Posting incident ${incidentId} to Slack`);

  const message = {
    text: `🚨 Incident: ${incidentData.title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 ${incidentData.title}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Severity:* ${incidentData.severity}`,
          },
          {
            type: "mrkdwn",
            text: `*Confidence:* ${hypothesis.confidence}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Hypothesis:* ${hypothesis.suspect}\n\n*Evidence:*\n${hypothesis.evidence.map((e) => `• ${e}`).join("\n")}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Recommendation:* ${recommendation.action} - ${recommendation.description}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*View in Dashboard:* https://devpulse-dashboard-713434268138.us-central1.run.app/incidents/${incidentId}`,
        },
      },
    ],
  };

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`[slack] Webhook failed: ${response.status} ${await response.text()}`);
    } else {
      console.log(`[slack] Successfully posted to Slack`);
    }

    return message;
  } catch (error) {
    console.error(`[slack] Error posting to Slack:`, error.message);
    return null;
  }
}
