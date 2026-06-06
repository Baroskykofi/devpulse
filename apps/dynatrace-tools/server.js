// apps/dynatrace-tools/server.js
// Express server wrapper for Cloud Run deployment

const express = require('express');
const { Firestore } = require('@google-cloud/firestore');

const app = express();
app.use(express.json());

const DYNATRACE_ENV_ID = process.env.DYNATRACE_ENVIRONMENT_ID;
const DYNATRACE_API_KEY = process.env.DYNATRACE_API_KEY;
const BASE_URL = `https://${DYNATRACE_ENV_ID}/api/v2`;

// ─── Dynatrace API helper ─────────────────────────────────────────────
async function dynatrace(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Api-Token ${DYNATRACE_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dynatrace ${res.status}: ${text}`);
  }

  return res.json();
}

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// ─── Tool: get_problem_details ────────────────────────────────────────
app.post('/get_problem_details', async (req, res) => {
  try {
    const { problemId } = req.body;

    if (!problemId) {
      return res.status(400).json({ error: 'problemId is required' });
    }

    const problem = await dynatrace(`/problems/${problemId}`);

    const result = {
      problemId: problem.problemId,
      title: problem.title,
      severity: problem.severityLevel,
      startTime: problem.startTime,
      endTime: problem.endTime,
      state: problem.status,
      impactLevel: problem.impactLevel,
      rootCause: problem.rootCauseEntity?.name || 'Unknown',
      affectedEntityCount: problem.affectedEntities?.length || 0,
    };

    res.json(result);
  } catch (error) {
    console.error('Error in get_problem_details:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Tool: get_affected_entities ──────────────────────────────────────
app.post('/get_affected_entities', async (req, res) => {
  try {
    const { problemId } = req.body;

    if (!problemId) {
      return res.status(400).json({ error: 'problemId is required' });
    }

    const problem = await dynatrace(`/problems/${problemId}`);

    const entities = (problem.affectedEntities || []).map((entity) => ({
      entityId: entity.entityId?.id || entity.entityId,
      name: entity.name,
      type: entity.entityId?.type || 'UNKNOWN',
    }));

    res.json({
      entities: entities.slice(0, 10),
      totalCount: entities.length,
    });
  } catch (error) {
    console.error('Error in get_affected_entities:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Tool: query_metrics ──────────────────────────────────────────────
app.post('/query_metrics', async (req, res) => {
  try {
    const { entityId, metricSelector, from = 'now-10m', to = 'now' } = req.body;

    if (!entityId || !metricSelector) {
      return res.status(400).json({ error: 'entityId and metricSelector are required' });
    }

    const params = new URLSearchParams({
      metricSelector,
      entitySelector: `entityId("${entityId}")`,
      from,
      to,
      resolution: '1m',
    });

    const data = await dynatrace(`/metrics/query?${params}`);

    const result = data.result?.[0];
    const dataPoints = result?.data?.[0]?.values || [];

    const values = dataPoints.map((dp) => dp[1]);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;

    res.json({
      metricId: result?.metricId,
      dataPoints: dataPoints.length,
      statistics: {
        avg: Math.round(avg * 100) / 100,
        max: Math.round(max * 100) / 100,
        min: Math.round(min * 100) / 100,
      },
      rawValues: dataPoints.slice(-10),
    });
  } catch (error) {
    console.error('Error in query_metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Tool: fetch_logs ─────────────────────────────────────────────────
app.post('/fetch_logs', async (req, res) => {
  try {
    const { entityId, from = 'now-10m', to = 'now', filter } = req.body;

    if (!entityId) {
      return res.status(400).json({ error: 'entityId is required' });
    }

    const params = new URLSearchParams({
      from,
      to,
      query: filter
        ? `entity.id="${entityId}" AND content="${filter}"`
        : `entity.id="${entityId}"`,
      maxResults: '50',
      sort: '-timestamp',
    });

    const data = await dynatrace(`/logs/search?${params}`);

    const logLines = (data.results || []).map((log) => ({
      timestamp: log.timestamp,
      severity: log.severity || log.status,
      content: log.content || log.message,
    }));

    res.json({
      totalCount: data.totalCount || logLines.length,
      logs: logLines.slice(0, 20),
    });
  } catch (error) {
    console.error('Error in fetch_logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Tool: write_reasoning_step ───────────────────────────────────────
app.post('/write_reasoning_step', async (req, res) => {
  try {
    const { incidentId, phase, label, content, toolCalls = [], logLines = [] } = req.body;

    if (!incidentId || !phase || !label || !content) {
      return res.status(400).json({
        error: 'incidentId, phase, label, and content are required'
      });
    }

    // Initialize Firestore with explicit project ID (trim whitespace)
    const projectId = (process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '').trim();
    const firestore = new Firestore({
      projectId: projectId
    });

    const step = {
      phase,
      label,
      content,
      toolCalls,
      logLines,
      timestamp: new Date().toISOString(),
    };

    await firestore
      .collection('incidents')
      .doc(incidentId)
      .collection('steps')
      .add(step);

    res.json({ success: true, step });
  } catch (error) {
    console.error('Error in write_reasoning_step:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Dynatrace tools server listening on port ${PORT}`);
});
