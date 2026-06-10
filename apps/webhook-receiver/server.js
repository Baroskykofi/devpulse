// apps/webhook-receiver/server.js
// HTTP server wrapper for Cloud Run deployment
// Wraps the Cloud Function logic in Express.js

const express = require('express');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Initialize Firebase with explicit project ID (trim whitespace)
const projectId = (process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '').trim();
initializeApp({
  projectId: projectId
});
const db = getFirestore();

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// ─── Dynatrace severity → DevPulse severity ───────────────────────
function mapSeverity(dynatraceSeverity) {
  const critical = ['AVAILABILITY', 'ERROR', 'PERFORMANCE'];
  return critical.includes(dynatraceSeverity) ? 'critical' : 'warning';
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
    console.warn(`[orchestrator] No ORCHESTRATOR_URL configured, skipping agent invocation`);
    return;
  }

  try {
    console.log(`[orchestrator] Invoking reasoning loop for incident ${incidentId}`);

    // Fire-and-forget: don't await the full response to avoid blocking the webhook
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
    console.error(`[orchestrator] error invoking orchestrator for ${incidentId}:`, err.message);
  }
}

// ─── Main webhook handler ─────────────────────────────────────────
app.post('/', async (req, res) => {
  try {
    const { problemId, problemTitle, state, severityLevel, impactedEntityNames } = req.body;

    // Validate required fields
    if (!problemId || !state) {
      return res.status(400).json({ error: 'Missing required fields: problemId, state' });
    }

    console.log(`[webhook] Received problem: ${problemId} (${state})`);

    const incidentId = `${problemId}-${Date.now()}`;

    // Check if incident already exists
    const existingQuery = await db.collection('incidents')
      .where('problemId', '==', problemId)
      .where('status', 'in', ['open', 'analyzing'])
      .limit(1)
      .get();

    let incidentRef;

    if (!existingQuery.empty) {
      // Update existing incident
      incidentRef = existingQuery.docs[0].ref;
      console.log(`[webhook] Updating existing incident: ${incidentRef.id}`);

      await incidentRef.update({
        state,
        lastUpdated: FieldValue.serverTimestamp(),
        ...(state === 'RESOLVED' && { status: 'resolved', resolvedAt: FieldValue.serverTimestamp() })
      });

      res.json({ incidentId: incidentRef.id, status: 'updated' });
    } else {
      // Create new incident
      console.log(`[webhook] Creating new incident: ${incidentId}`);

      const metrics = await fetchInitialMetrics(problemId);

      const incidentData = {
        incidentId,
        problemId,
        title: problemTitle || `Problem ${problemId}`,
        severity: mapSeverity(severityLevel),
        status: 'active',  // Dashboard expects: 'active' | 'resolved' | 'escalated'
        state,
        service: impactedEntityNames?.[0] || 'unknown-service',  // Required by dashboard
        dynatraceProblemId: problemId,  // Required by dashboard
        affectedEntities: impactedEntityNames || [],
        metrics,
        hypothesis: null,
        recommendation: null,
        approvalStatus: 'pending',
        startedAt: FieldValue.serverTimestamp(),  // Dashboard queries by this field
        createdAt: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp(),
      };

      incidentRef = db.collection('incidents').doc(incidentId);
      await incidentRef.set(incidentData);

      // Invoke agent (fire-and-forget)
      invokeAgent(incidentId, problemId).catch(err => {
        console.error(`[agent] Failed to invoke agent: ${err.message}`);
      });

      res.json({ incidentId, status: 'created' });
    }
  } catch (error) {
    console.error('[webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Webhook receiver listening on port ${PORT}`);
});
