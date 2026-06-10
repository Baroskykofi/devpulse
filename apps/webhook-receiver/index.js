// apps/webhook-receiver/index.js
// Cloud Function — entry point for Dynatrace problem webhooks.
// Creates/updates Firestore incident docs and invokes the Agent Builder agent.

const { onRequest } = require("firebase-functions/v2/http");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { AgentsClient } = require("@google-cloud/agents");

initializeApp();
const db = getFirestore();

// ─── Dynatrace severity → DevPulse severity ───────────────────────
function mapSeverity(dynatraceSeverity) {
  const critical = ["AVAILABILITY", "ERROR", "PERFORMANCE"];
  return critical.includes(dynatraceSeverity) ? "critical" : "warning";
}

// ─── Fetch initial metrics from Dynatrace ─────────────────────────
async function fetchInitialMetrics(problemId) {
  // The agent fills in real metrics during the Observe phase.
  // Return baseline defaults here so the dashboard renders immediately.
  return { errorRate: 0, p99Latency: 0, requestsPerMin: 0, instanceCount: 0 };
}

// ─── Invoke Agent Orchestrator ───────────────────────────────────
async function invokeAgent(incidentId, problemId) {
  const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL;

  if (!ORCHESTRATOR_URL) {
    console.error(`[orchestrator] No ORCHESTRATOR_URL configured`);
    return;
  }

  try {
    console.log(`[orchestrator] Invoking reasoning loop for incident ${incidentId}`);

    // Fire-and-forget: don't await the full response
    fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { incidentId, problemId }
      }),
    }).catch(err => {
      console.error(`[orchestrator] invocation error for ${incidentId}:`, err.message);
    });

    console.log(`[orchestrator] Reasoning loop triggered for ${incidentId}`);
  } catch (err) {
    console.error(`[orchestrator] error invoking agent for ${incidentId}:`, err.message);
  }
}

// ─── Main handler ─────────────────────────────────────────────────
exports.webhookReceiver = onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const payload = req.body;
  console.log("[webhook] received:", JSON.stringify(payload));

  const {
    problemId,
    problemTitle,
    state,
    severityLevel,
    impactedEntityNames = [],
  } = payload;

  if (!problemId || !state) {
    return res.status(400).json({ error: "problemId and state are required" });
  }

  try {
    if (state === "OPEN" || state === "PROBLEM_OPENED") {
      // ── Create new incident ──
      const incidentId = `${problemId}-${Date.now()}`;
      const metrics    = await fetchInitialMetrics(problemId);

      await db.collection("incidents").doc(incidentId).set({
        status:              "active",
        severity:            mapSeverity(severityLevel),
        title:               problemTitle ?? `Incident on ${impactedEntityNames[0] ?? "unknown service"}`,
        service:             impactedEntityNames[0] ?? "unknown",
        dynatraceProblemId:  problemId,
        startedAt:           FieldValue.serverTimestamp(),
        metrics,
        affectedEntities:    [],
        approvalStatus:      null,
      });

      console.log(`[webhook] created incident ${incidentId}`);

      // Invoke agent — fire and forget, respond to Dynatrace immediately
      invokeAgent(incidentId, problemId);

      return res.status(200).json({ incidentId, status: "created" });
    }

    if (state === "RESOLVED" || state === "PROBLEM_RESOLVED") {
      // ── Resolve existing incident ──
      const snap = await db.collection("incidents")
        .where("dynatraceProblemId", "==", problemId)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (snap.empty) {
        console.warn(`[webhook] no active incident found for ${problemId}`);
        return res.status(200).json({ status: "no-op" });
      }

      const docRef = snap.docs[0].ref;
      await docRef.update({
        status:     "resolved",
        resolvedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[webhook] resolved incident ${snap.docs[0].id}`);
      return res.status(200).json({ incidentId: snap.docs[0].id, status: "resolved" });
    }

    // Ignore other states (e.g. PROBLEM_UPDATED)
    return res.status(200).json({ status: "ignored", state });

  } catch (err) {
    console.error("[webhook] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Replay request watcher ───────────────────────────────────────
// Watches the `replay_requests` Firestore collection (written by the dashboard's
// "Replay Scenario" button) and injects scripted incidents.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const SCENARIOS = require("./scenarios.json");

exports.replayWatcher = onDocumentCreated("replay_requests/{docId}", async (event) => {
  const data = event.data.data();
  const { scenarioId } = data;
  const scenario = SCENARIOS[scenarioId];

  if (!scenario) {
    console.warn(`[replay] unknown scenario: ${scenarioId}`);
    return;
  }

  const incidentId = `REPLAY-${scenarioId}-${Date.now()}`;

  await db.collection("incidents").doc(incidentId).set({
    ...scenario.incident,
    startedAt:    FieldValue.serverTimestamp(),
    approvalStatus: null,
    affectedEntities: [],
  });

  invokeAgent(incidentId, scenario.incident.dynatraceProblemId);

  await event.data.ref.update({ status: "triggered", incidentId });
  console.log(`[replay] triggered scenario ${scenarioId} → incident ${incidentId}`);
});
