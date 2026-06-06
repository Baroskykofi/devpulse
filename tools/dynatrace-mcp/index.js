// tools/dynatrace-mcp/index.js
// Custom MCP wrapper for Dynatrace API
// Exposes: get_problem_details, get_affected_entities, query_metrics, fetch_logs

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const DYNATRACE_ENV_ID = process.env.DYNATRACE_ENVIRONMENT_ID;
const DYNATRACE_API_KEY = process.env.DYNATRACE_API_KEY;
const BASE_URL = `https://${DYNATRACE_ENV_ID}/api/v2`;

// ─── Dynatrace API helper ─────────────────────────────────────────────

async function dynatrace(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Api-Token ${DYNATRACE_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dynatrace ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── MCP server ───────────────────────────────────────────────────────

const server = new McpServer({ name: "dynatrace-mcp", version: "1.0.0" });

// ── get_problem_details ───────────────────────────────────────────────

server.tool(
  "get_problem_details",
  "Fetch full context for a Dynatrace problem ID. Returns title, severity, start time, status, and Davis AI root cause analysis.",
  {
    problemId: z.string().describe("The Dynatrace problem ID (e.g., P-230948)"),
  },
  async ({ problemId }) => {
    const problem = await dynatrace(`/problems/${problemId}`);

    const result = {
      problemId: problem.problemId,
      title: problem.title,
      severity: problem.severityLevel,
      startTime: problem.startTime,
      endTime: problem.endTime,
      state: problem.status,
      impactLevel: problem.impactLevel,
      rootCause: problem.rootCauseEntity?.name || "Unknown",
      affectedEntityCount: problem.affectedEntities?.length || 0,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ── get_affected_entities ─────────────────────────────────────────────

server.tool(
  "get_affected_entities",
  "Get all services, hosts, and processes implicated in a Dynatrace problem. Returns entity names, types, and health status.",
  {
    problemId: z.string().describe("The Dynatrace problem ID"),
  },
  async ({ problemId }) => {
    const problem = await dynatrace(`/problems/${problemId}`);

    const entities = (problem.affectedEntities || []).map((entity) => ({
      entityId: entity.entityId?.id || entity.entityId,
      name: entity.name,
      type: entity.entityId?.type || "UNKNOWN",
    }));

    // Get additional details for each entity
    const detailedEntities = await Promise.all(
      entities.slice(0, 5).map(async (entity) => {
        // Limit to 5 entities
        try {
          const details = await dynatrace(`/entities/${entity.entityId}`);
          return {
            ...entity,
            displayName: details.displayName,
            tags: details.tags?.slice(0, 3),
          };
        } catch (error) {
          return entity; // Return basic info if details fail
        }
      })
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entities: detailedEntities,
              totalCount: entities.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── query_metrics ─────────────────────────────────────────────────────

server.tool(
  "query_metrics",
  "Fetch time-series metric data from Dynatrace for a specific entity and time window. Use metricSelector: 'builtin:service.errors.total.rate' for error rate, 'builtin:service.response.time:percentile(99)' for p99 latency.",
  {
    entityId: z.string().describe("Dynatrace entity ID"),
    metricSelector: z
      .string()
      .describe("Dynatrace metric selector (e.g., builtin:service.errors.total.rate)"),
    from: z
      .string()
      .describe("Start time ISO 8601 or relative (e.g., now-5m)")
      .default("now-10m"),
    to: z.string().describe("End time ISO 8601 or relative (e.g., now)").default("now"),
  },
  async ({ entityId, metricSelector, from, to }) => {
    const params = new URLSearchParams({
      metricSelector,
      entitySelector: `entityId("${entityId}")`,
      from,
      to,
      resolution: "1m",
    });

    const data = await dynatrace(`/metrics/query?${params}`);

    // Parse the response
    const result = data.result?.[0];
    const dataPoints = result?.data?.[0]?.values || [];

    // Calculate statistics
    const values = dataPoints.map((dp) => dp[1]);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              metricId: result?.metricId,
              unit: result?.data?.[0]?.dimensionMap?.["dt.entity.service"],
              dataPoints: dataPoints.length,
              statistics: {
                avg: Math.round(avg * 100) / 100,
                max: Math.round(max * 100) / 100,
                min: Math.round(min * 100) / 100,
              },
              rawValues: dataPoints.slice(-10), // Last 10 points
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── fetch_logs ────────────────────────────────────────────────────────

server.tool(
  "fetch_logs",
  "Fetch recent log lines from affected entities via Dynatrace. Pass filter: 'ERROR' to focus on errors. Returns raw log lines as strings.",
  {
    entityId: z.string().describe("Dynatrace entity ID"),
    from: z.string().describe("Start time ISO 8601 or relative").default("now-10m"),
    to: z.string().describe("End time ISO 8601 or relative").default("now"),
    filter: z.string().describe("Log filter string (e.g., 'ERROR')").optional(),
  },
  async ({ entityId, from, to, filter }) => {
    const params = new URLSearchParams({
      from,
      to,
      query: filter
        ? `entity.id="${entityId}" AND content="${filter}"`
        : `entity.id="${entityId}"`,
      maxResults: "50",
      sort: "-timestamp",
    });

    const data = await dynatrace(`/logs/search?${params}`);

    const logLines = (data.results || []).map((log) => ({
      timestamp: log.timestamp,
      severity: log.severity || log.status,
      content: log.content || log.message,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              totalCount: data.totalCount || logLines.length,
              logs: logLines.slice(0, 20), // Max 20 lines
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── write_reasoning_step ──────────────────────────────────────────────
// This tool writes to Firestore from the agent

server.tool(
  "write_reasoning_step",
  "Append a reasoning step to the incident's Firestore steps subcollection. Call before and after every significant action. The dashboard streams these steps in real time.",
  {
    incidentId: z.string().describe("Firestore incident ID"),
    phase: z
      .enum(["observe", "correlate", "hypothesize", "recommend", "execute", "verify", "waiting", "error"])
      .describe("Current reasoning phase"),
    label: z
      .string()
      .describe("Short description (e.g., 'Pulling problem context from Dynatrace')"),
    content: z.string().describe("Full narrative of the agent's reasoning for this step"),
    toolCalls: z
      .array(
        z.object({
          name: z.string().describe("Tool name + key args (e.g., 'get_problem_details(P-123)')"),
          result: z.string().describe("Result summary (e.g., '200 OK' or '3 entities')"),
        })
      )
      .optional(),
    logLines: z
      .array(z.string())
      .describe("Raw log lines from fetch_logs. Max 20 lines.")
      .optional(),
  },
  async ({ incidentId, phase, label, content, toolCalls, logLines }) => {
    // In production, this would write to Firestore
    // For now, just return success
    console.log(`[reasoning-step] ${incidentId} / ${phase} / ${label}`);

    const step = {
      phase,
      label,
      content,
      toolCalls: toolCalls || [],
      logLines: logLines || [],
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, step }, null, 2),
        },
      ],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("dynatrace-mcp server started");
});
