// apps/agent-orchestrator/index.js
// Cloud Function that orchestrates the agent reasoning loop
// Invoked by webhook-receiver, manages agent state and tool execution

const { onCall } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

initializeApp();
const db = getFirestore();

// ─── Agent Reasoning Orchestrator ─────────────────────────────────────
// This orchestrator manages the 5-phase reasoning loop:
// Observe → Correlate → Hypothesize → Recommend → Execute & Verify

exports.runReasoningLoop = onCall(async (request) => {
  const { incidentId, problemId } = request.data;

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

    const data = incident.data();

    // Initialize reasoning state if not present
    if (!data.reasoningState) {
      await incidentRef.update({
        reasoningState: {
          phase: "observe",
          toolCallCount: 0,
          startedAt: FieldValue.serverTimestamp(),
        },
      });
    }

    // Execute the current phase
    const phase = data.reasoningState?.phase || "observe";
    const result = await executePhase(incidentId, problemId, phase, data);

    return { success: true, phase, result };
  } catch (error) {
    console.error("[orchestrator] error:", error);

    // Write error to Firestore
    await db.collection("incidents").doc(incidentId).collection("steps").add({
      phase: "error",
      label: "Agent error occurred",
      content: `Error: ${error.message}`,
      timestamp: FieldValue.serverTimestamp(),
    });

    throw error;
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
    : { logLines: [] };

  // Update incident with observed data
  await incidentRef.update({
    affectedEntities: affectedEntities.entities || [],
    metrics,
    observedLogs: logs.logLines?.slice(0, 20) || [], // Max 20 lines
    "reasoningState.phase": "correlate",
    "reasoningState.toolCallCount": FieldValue.increment(4),
  });

  // Write completion step
  await writeStep(incidentId, {
    phase: "observe",
    label: "Observation complete",
    content: `Found ${affectedEntities.entities?.length || 0} affected entities. Error rate: ${metrics.errorRate}%, p99 latency: ${metrics.p99Latency}ms. Captured ${logs.logLines?.length || 0} error log lines.`,
    toolCalls: [
      { name: "get_problem_details", result: "Success" },
      { name: "get_affected_entities", result: `${affectedEntities.entities?.length || 0} entities` },
      { name: "query_metrics", result: "3 metrics" },
      { name: "fetch_logs", result: `${logs.logLines?.length || 0} lines` },
    ],
    logLines: logs.logLines?.slice(0, 10),
  });

  return { metrics, entities: affectedEntities.entities, logCount: logs.logLines?.length };
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
      timestamp: FieldValue.serverTimestamp(),
    });
}

async function callDynatraceTool(toolName, params) {
  // Placeholder - in production this calls the Dynatrace API
  // via MCP server or direct HTTP
  console.log(`[dynatrace] ${toolName}`, params);

  // Mock responses for testing
  switch (toolName) {
    case "get_problem_details":
      return {
        problemId: params.problemId,
        title: "Error rate increase on demo-api",
        severity: "ERROR",
        startTime: "2026-05-31T10:00:00Z",
        state: "OPEN",
      };

    case "get_affected_entities":
      return {
        entities: [
          {
            entityId: "SERVICE-ABC123",
            name: "demo-api",
            type: "SERVICE",
          },
        ],
      };

    case "fetch_logs":
      return {
        logLines: [
          "2026-05-31T10:00:15Z ERROR TypeError: Cannot read property 'text' of undefined",
          "2026-05-31T10:00:16Z ERROR at POST /todos (index.js:45)",
        ],
      };

    default:
      return {};
  }
}

async function callGitHubTool(toolName, params) {
  // Placeholder - calls GitHub MCP server or GitHub API directly
  console.log(`[github] ${toolName}`, params);

  // Mock responses
  switch (toolName) {
    case "list_recent_commits":
      return {
        commits: [
          {
            sha: "abc1234",
            fullSha: "abc1234567890",
            message: "Fix: Update todo validation",
            author: "developer",
            timestamp: "2026-05-31T09:58:00Z",
          },
        ],
      };

    case "get_commit_diff":
      return {
        sha: "abc1234",
        message: "Fix: Update todo validation",
        files: [
          {
            filename: "index.js",
            status: "modified",
            additions: 5,
            deletions: 2,
            patch: "@@ -42,7 +42,8 @@\n-  const todo = req.body;\n+  const todo = req.body.todo;",
          },
        ],
      };

    case "revert_commit":
      return {
        ok: true,
        revertSha: "xyz9876",
        message: "Revert commit pushed successfully",
      };

    default:
      return {};
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
  // Placeholder - posts to Slack webhook
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
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approve",
            },
            style: "primary",
            value: incidentId,
            action_id: "approve_action",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Reject",
            },
            style: "danger",
            value: incidentId,
            action_id: "reject_action",
          },
        ],
      },
    ],
  };

  // Send to Slack (implement actual webhook call)
  // await fetch(process.env.SLACK_WEBHOOK_URL, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(message),
  // });

  return message;
}
