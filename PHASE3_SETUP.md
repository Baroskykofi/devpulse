# Phase 3 Setup Guide - AI-Powered Incident Response

This guide walks you through configuring Agent Builder (Gemini) to use the Dynatrace Tools API for autonomous incident investigation.

## Overview

Phase 3 adds AI-powered incident analysis:
- **Agent Builder** analyzes incidents using Dynatrace observability data
- **Dynatrace Tools** provide metrics, logs, and problem details
- **Reasoning Steps** document the agent's investigation process
- **Recommendations** generated for rollback, PR, or escalation

## Prerequisites

✅ Phase 1 & 2 complete:
- All 4 services deployed to Cloud Run
- Dynatrace webhook configured
- Firestore permissions set up
- Dashboard displaying incidents

## Step 1: Deploy Updated Dynatrace Tools

The dynatrace-tools service now includes an OpenAPI spec endpoint.

### 1.1 Commit and Push Changes

```bash
cd /path/to/devpulse
git add apps/dynatrace-tools/
git commit -m "feat: Add OpenAPI spec endpoint for Agent Builder integration"
git push origin main
```

### 1.2 Wait for Cloud Build

Monitor the build at: https://console.cloud.google.com/cloud-build/builds?project=devpaulse

### 1.3 Verify OpenAPI Endpoint

Once deployed, verify the endpoint is accessible:

```bash
curl https://devpulse-dynatrace-tools-713434268138.us-central1.run.app/openapi.yaml
```

You should see the OpenAPI specification returned.

## Step 2: Configure Agent Builder Tools

### 2.1 Access Agent Builder Console

1. Go to [Agent Builder Console](https://console.cloud.google.com/gen-app-builder/engines?project=devpaulse)
2. Find your agent (ID: `ec726e22-6a27-4d3b-bea6-947a11380b09`)
3. Click on it to open the agent configuration

### 2.2 Add OpenAPI Extension

1. In the agent configuration, go to **Tools & Extensions**
2. Click **Add Extension** or **Add Tool**
3. Select **OpenAPI**
4. Configure:
   - **Name**: `Dynatrace Tools`
   - **Description**: `Tools for investigating incidents using Dynatrace observability data`
   - **OpenAPI Spec URL**: `https://devpulse-dynatrace-tools-713434268138.us-central1.run.app/openapi.yaml`
   - **Authentication**: None (services are allow-unauthenticated for demo)

5. Click **Import** or **Save**

### 2.3 Verify Tools Are Available

Agent Builder should now show these tools:
- ✅ `get_problem_details` - Get Dynatrace problem information
- ✅ `get_affected_entities` - List affected services/hosts
- ✅ `query_metrics` - Query time-series metrics
- ✅ `fetch_logs` - Retrieve relevant logs
- ✅ `write_reasoning_step` - Document investigation steps

### 2.4 Update Agent Instructions (Optional but Recommended)

Add specific instructions to guide the agent's behavior:

**Go to Agent Instructions/Prompt:**

```
You are DevPulse, an autonomous incident-response agent for solo developers.

## Your Role
When a production incident occurs, you investigate the issue using Dynatrace observability data and provide actionable recommendations.

## Investigation Process
Follow this structured approach:

1. **OBSERVE** - Gather initial data
   - Use get_problem_details to understand the problem
   - Use get_affected_entities to identify impacted services
   - Use write_reasoning_step to document your observations

2. **CORRELATE** - Find patterns
   - Use query_metrics to analyze error rates, latency, throughput
   - Use fetch_logs to find error messages and stack traces
   - Look for correlations between metrics spikes and log errors
   - Document findings with write_reasoning_step

3. **HYPOTHESIZE** - Form theories
   - Based on the evidence, propose likely root causes
   - Consider: bad deployments, config changes, dependency failures, resource exhaustion
   - Assign confidence levels (high/medium/low)
   - Document hypothesis with write_reasoning_step

4. **RECOMMEND** - Propose actions
   - **ROLLBACK**: If recent deployment caused the issue
   - **PR**: If a code fix is needed
   - **ESCALATE**: If human intervention required
   - Provide clear, actionable description
   - Document recommendation with write_reasoning_step

## Important Guidelines
- Always use write_reasoning_step to document each phase
- Include relevant metrics and log snippets in your reasoning
- Be concise but thorough
- If unsure, recommend ESCALATE with context
- Focus on "why" not just "what" - explain your reasoning

## Example Investigation
Problem: High error rate on demo-api service

1. OBSERVE: "Error rate jumped to 24% at 14:32. Affected entity: demo-api. Severity: ERROR"
2. CORRELATE: "Logs show TypeError: Cannot read properties of undefined (reading 'userId'). Metrics show error spike coincides with deployment at 14:30"
3. HYPOTHESIZE: "High confidence: Recent deployment introduced regression in authentication middleware"
4. RECOMMEND: "ROLLBACK to previous version. The auth refactor removed req.user population, breaking POST /todos endpoint"
```

Click **Save**.

## Step 3: Update Webhook Receiver to Invoke Agent

Now we need to actually call the agent when incidents are created.

### 3.1 Install Agent Builder Client Library

Update `apps/webhook-receiver/package.json`:

```json
{
  "name": "devpulse-webhook-receiver",
  "version": "1.0.0",
  "main": "server.js",
  "engines": { "node": "20" },
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "firebase-admin": "^12.0.0",
    "@google-cloud/discoveryengine": "^1.7.0"
  }
}
```

### 3.2 Update webhook-receiver/server.js

Replace the `invokeAgent` function stub with actual implementation:

```javascript
// ─── Invoke Agent Builder agent ───────────────────────────────────────
async function invokeAgent(incidentId, problemId) {
  try {
    const { SessionsClient } = require('@google-cloud/discoveryengine').v1alpha;

    const client = new SessionsClient();
    const project = process.env.AGENT_BUILDER_PROJECT || 'devpaulse';
    const location = process.env.AGENT_BUILDER_LOCATION || 'us-central1';
    const agentId = process.env.AGENT_BUILDER_AGENT_ID;
    const sessionId = incidentId; // Use incident ID as session ID for continuity

    const session = client.sessionPath(
      project,
      location,
      'default_data_store', // Use 'default_data_store' or your data store ID
      agentId,
      sessionId
    );

    const request = {
      session,
      query: {
        text: `Investigate incident ${incidentId}. The Dynatrace problem ID is ${problemId}. Please analyze this incident, gather relevant metrics and logs, and provide a recommendation.`,
      },
    };

    console.log(`[agent] Invoking agent for incident ${incidentId}`);

    // Stream the agent's response
    const responses = await client.converse(request);

    for await (const response of responses) {
      if (response.reply?.summary) {
        console.log(`[agent] Response: ${response.reply.summary}`);
      }
    }

    console.log(`[agent] Agent invocation complete for incident ${incidentId}`);
  } catch (error) {
    console.error(`[agent] Failed to invoke agent: ${error.message}`);
    // Don't throw - we don't want webhook to fail if agent invocation fails
  }
}
```

### 3.3 Commit and Deploy

```bash
git add apps/webhook-receiver/
git commit -m "feat: Implement Agent Builder invocation for incident analysis"
git push origin main
```

Wait for Cloud Build to complete.

## Step 4: Test the End-to-End Flow

### 4.1 Create a Test Incident

Send a webhook to create an incident:

```bash
curl -X POST https://devpulse-webhook-receiver-713434268138.us-central1.run.app \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "P-TEST-AI-001",
    "problemTitle": "High error rate on demo-api",
    "state": "OPEN",
    "severityLevel": "ERROR",
    "impactedEntityNames": ["demo-api"]
  }'
```

### 4.2 Monitor Agent Activity

**Check webhook-receiver logs:**
```
https://console.cloud.google.com/run/detail/us-central1/devpulse-webhook-receiver/logs?project=devpaulse
```

Look for:
- `[agent] Invoking agent for incident P-TEST-AI-001`
- `[agent] Response: ...`
- `[agent] Agent invocation complete`

**Check Firestore for reasoning steps:**
1. Go to [Firestore Console](https://console.firebase.google.com/project/devpulse-a3550/firestore)
2. Navigate to `incidents/{incidentId}/steps`
3. You should see reasoning steps created by the agent

**Check the dashboard:**
1. Open https://devpulse-dashboard-713434268138.us-central1.run.app
2. Click on the incident
3. You should see the agent's reasoning process displayed

### 4.3 Test with Real Errors

Generate actual errors that Dynatrace will detect:

```bash
# Enable chaos mode
curl -X POST https://devpulse-demo-api-713434268138.us-central1.run.app/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"errors"}'

# Generate failing requests
for i in {1..30}; do
  curl -X POST https://devpulse-demo-api-713434268138.us-central1.run.app/todos \
    -H "Content-Type: application/json" \
    -d '{"text":"Test '$i'"}' && sleep 0.5
done
```

**Expected flow:**
1. Dynatrace detects errors and creates problem
2. Dynatrace sends webhook to DevPulse
3. Webhook receiver creates incident in Firestore
4. Webhook receiver invokes Agent Builder
5. Agent Builder uses Dynatrace Tools to investigate
6. Agent writes reasoning steps to Firestore
7. Dashboard displays the investigation in real-time

## Step 5: Verify Agent Reasoning

### 5.1 Check Agent Tool Usage

In Agent Builder console, you can view:
- Tool calls made by the agent
- Responses from each tool
- Agent's reasoning process

### 5.2 Review Reasoning Steps in Dashboard

The dashboard should show:
- **OBSERVE** phase: Problem details, affected entities
- **CORRELATE** phase: Metrics analysis, log findings
- **HYPOTHESIZE** phase: Root cause theories
- **RECOMMEND** phase: Proposed action (ROLLBACK/PR/ESCALATE)

### 5.3 Validate Recommendations

Check if the agent's recommendations make sense:
- Are they based on the observability data?
- Do they correctly identify the root cause?
- Is the proposed action appropriate?

## Troubleshooting

### Agent Not Invoking

**Check webhook-receiver logs:**
```bash
# Look for errors in agent invocation
gcloud run logs read devpulse-webhook-receiver --region=us-central1 --project=devpaulse --limit=50
```

**Common issues:**
- Missing `@google-cloud/discoveryengine` package
- Incorrect agent ID or project configuration
- Service account doesn't have Agent Builder permissions

**Fix service account permissions:**
1. Go to [IAM](https://console.cloud.google.com/iam-admin/iam?project=devpaulse)
2. Find `713434268138-compute@developer.gserviceaccount.com`
3. Add role: **Dialogflow API Client** (or **Discovery Engine Viewer**)

### Tools Not Working

**Verify OpenAPI endpoint:**
```bash
curl https://devpulse-dynatrace-tools-713434268138.us-central1.run.app/openapi.yaml
```

**Check Agent Builder tool configuration:**
- Ensure the OpenAPI URL is correct
- Verify the spec is valid YAML
- Check that tool endpoints are accessible

**Test tools manually:**
```bash
# Test get_problem_details
curl -X POST https://devpulse-dynatrace-tools-713434268138.us-central1.run.app/get_problem_details \
  -H "Content-Type: application/json" \
  -d '{"problemId":"P-TEST-001"}'
```

### No Reasoning Steps in Firestore

**Check dynatrace-tools logs:**
```bash
gcloud run logs read devpulse-dynatrace-tools --region=us-central1 --project=devpaulse --limit=50
```

**Verify write_reasoning_step is being called:**
- Check Agent Builder logs for tool calls
- Ensure the agent is using the tool correctly
- Verify Firestore permissions are still set

### Agent Gives Unhelpful Responses

**Refine agent instructions:**
- Add more specific examples
- Clarify expected output format
- Add constraints or requirements

**Provide better context in webhook:**
- Include more problem details
- Add entity information
- Pass severity and impact data

## Next Steps

### Phase 4: Automated Actions

Now that the agent can investigate and recommend actions, you can implement:

1. **Automatic Rollback**
   - Agent triggers rollback via Cloud Run API
   - Requires proper permissions and guardrails

2. **PR Generation**
   - Agent creates GitHub PR with proposed fix
   - Uses GitHub API to create branch and PR

3. **Escalation Integration**
   - Send recommendations to Slack
   - Create PagerDuty incidents
   - Email notifications

### Phase 5: Learning & Improvement

- Track recommendation accuracy
- Learn from past incidents
- Improve hypothesis confidence
- Build incident knowledge base

## Resources

- **Agent Builder Docs**: https://cloud.google.com/generative-ai-app-builder/docs/agent-intro
- **Discovery Engine API**: https://cloud.google.com/nodejs/docs/reference/discoveryengine/latest
- **OpenAPI Spec**: https://swagger.io/specification/
- **Dynatrace API**: https://www.dynatrace.com/support/help/dynatrace-api

---

**Phase 3 Complete!** 🎉

Your DevPulse agent can now autonomously investigate incidents using real observability data.
