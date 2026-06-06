// apps/webhook-receiver/server.js
// HTTP server wrapper for Cloud Run deployment
// Wraps the Cloud Function logic in Express.js

const express = require('express');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Initialize Firebase
initializeApp();
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

// ─── Invoke Agent Builder agent ───────────────────────────────────
async function invokeAgent(incidentId, problemId) {
  // Agent invocation is handled by the agent-orchestrator in Phase 3
  // For Phase 2, we just log that we would invoke the agent
  console.log(`[agent] Would invoke agent for incident ${incidentId}, problem ${problemId}`);

  // TODO: Implement agent invocation when agent-orchestrator is deployed
  // const { AgentsClient } = require('@google-cloud/agents');
  // const client = new AgentsClient();
  // const agentPath = client.agentPath(
  //   process.env.AGENT_BUILDER_PROJECT,
  //   process.env.AGENT_BUILDER_LOCATION,
  //   process.env.AGENT_BUILDER_AGENT_ID
  // );
  // await client.streamingDetectIntent({ ... });
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
        status: 'open',
        state,
        affectedEntities: impactedEntityNames || [],
        metrics,
        hypothesis: null,
        recommendation: null,
        approvalStatus: 'pending',
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
