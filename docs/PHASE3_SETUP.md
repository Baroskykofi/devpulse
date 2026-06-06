# Phase 3: Reasoning Loop Setup Guide

This guide walks you through implementing the **full reasoning loop** that powers DevPulse's autonomous incident response.

---

## Overview

Phase 3 implements the 5-phase reasoning flow:
1. **Observe** - Pull metrics, logs, entities from Dynatrace
2. **Correlate** - Scan recent commits, identify deployment timing
3. **Hypothesize** - Form root cause hypothesis with confidence score
4. **Recommend** - Propose action (ROLLBACK, ESCALATE, or PR)
5. **Execute & Verify** - Execute with approval, monitor resolution

---

## Prerequisites

✅ **Phase 2 completed:**
- Firebase/Firestore deployed
- Webhook receiver deployed
- Agent Builder configured (optional for Phase 3)

✅ **Required accounts:**
- Google Cloud Platform (same project)
- Firebase (from Phase 2)
- GitHub (for commit analysis)
- Slack (optional - for approval buttons)

---

## Step 1: Deploy Agent Orchestrator

The orchestrator manages the 5-phase reasoning loop.

### A. Review Orchestration Logic

The orchestrator is located at `apps/agent-orchestrator/index.js` and implements:
- Phase transitions (observe → correlate → hypothesize → recommend → execute)
- Tool call management
- Firestore state updates
- Approval gate enforcement

### B. Deploy to Cloud Functions

```bash
cd infra
./phase3-deploy.sh

# OR manually:
cd apps/agent-orchestrator
npm install

gcloud functions deploy runReasoningLoop \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point runReasoningLoop \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars FIRESTORE_PROJECT_ID=$GCP_PROJECT_ID \
  --set-env-vars GITHUB_TOKEN=$GITHUB_TOKEN \
  --set-env-vars GITHUB_REPO_OWNER=$GITHUB_REPO_OWNER \
  --set-env-vars GITHUB_REPO_NAME=$GITHUB_REPO_NAME
```

### C. Get Orchestrator URL

```bash
export ORCHESTRATOR_URL=$(gcloud functions describe runReasoningLoop \
  --gen2 \
  --region us-central1 \
  --format 'value(serviceConfig.uri)')

echo $ORCHESTRATOR_URL
# Save to phase3-outputs.env
```

---

## Step 2: Configure Dynatrace Tools

Dynatrace tools can be integrated two ways:

### Option A: HTTP Tools in Agent Builder (Recommended)

Configure these HTTP tools in Agent Builder console:

#### Tool 1: get_problem_details
```json
{
  "method": "GET",
  "url": "https://{{DYNATRACE_ENVIRONMENT_ID}}/api/v2/problems/{{problemId}}",
  "headers": {
    "Authorization": "Api-Token {{DYNATRACE_API_KEY}}"
  }
}
```

#### Tool 2: get_affected_entities
```json
{
  "method": "GET",
  "url": "https://{{DYNATRACE_ENVIRONMENT_ID}}/api/v2/problems/{{problemId}}",
  "headers": {
    "Authorization": "Api-Token {{DYNATRACE_API_KEY}}"
  }
}
```

#### Tool 3: query_metrics
```json
{
  "method": "GET",
  "url": "https://{{DYNATRACE_ENVIRONMENT_ID}}/api/v2/metrics/query",
  "headers": {
    "Authorization": "Api-Token {{DYNATRACE_API_KEY}}"
  },
  "params": {
    "metricSelector": "{{metricSelector}}",
    "entitySelector": "entityId(\"{{entityId}}\")",
    "from": "{{from}}",
    "to": "{{to}}"
  }
}
```

### Option B: Deploy Dynatrace MCP Server

```bash
cd tools/dynatrace-mcp
npm install

# Run as standalone MCP server
npm start

# Or deploy to Cloud Run
gcloud run deploy dynatrace-mcp \
  --source . \
  --region us-central1 \
  --set-env-vars DYNATRACE_ENVIRONMENT_ID=$DYNATRACE_ENVIRONMENT_ID \
  --set-env-vars DYNATRACE_API_KEY=$DYNATRACE_API_KEY
```

---

## Step 3: Connect GitHub Tools

### A. Create GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. **Scopes:** `repo`, `read:org`
4. Copy token and add to `.env`:
   ```bash
   GITHUB_TOKEN=github_pat_XXXXXXXXXXXXXXXXXXXX
   GITHUB_REPO_OWNER=Baroskykofi
   GITHUB_REPO_NAME=devpulse
   ```

### B. Deploy GitHub MCP Server (from Phase 2)

```bash
cd infra
./deploy-github-mcp.sh
```

---

## Step 4: Set Up Slack Integration (Optional)

Slack provides interactive approval buttons. If skipped, use dashboard-only approval.

### A. Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. **App name:** DevPulse
4. **Workspace:** Your workspace

### B. Configure Bot Scopes

Navigate to **OAuth & Permissions**:
- `chat:write` - Post messages
- `chat:write.public` - Post to public channels
- `incoming-webhook` - Receive webhooks

Click "Install to Workspace"

### C. Get Credentials

Copy these values to `.env`:
```bash
SLACK_BOT_TOKEN=xoxb-XXXXXXXXXXXX
SLACK_SIGNING_SECRET=XXXXXXXXXXXX
SLACK_CHANNEL=#incidents
```

### D. Deploy Slack Bridge

```bash
# Already deployed by phase3-deploy.sh
# Or manually:
cd apps/slack-bridge
npm install

gcloud functions deploy slackEvents \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point slackEvents \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN \
  --set-env-vars SLACK_SIGNING_SECRET=$SLACK_SIGNING_SECRET \
  --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID
```

### E. Configure Slack URLs

Get Slack bridge URL:
```bash
export SLACK_URL=$(gcloud functions describe slackEvents \
  --gen2 \
  --region us-central1 \
  --format 'value(serviceConfig.uri)')
```

In Slack app settings:
1. **Interactivity & Shortcuts:**
   - Request URL: `$SLACK_URL/slack/events`
2. **Event Subscriptions:**
   - Request URL: `$SLACK_URL`

---

## Step 5: Update Webhook Receiver

Connect webhook receiver to orchestrator:

```bash
# Get orchestrator URL
export ORCHESTRATOR_URL=$(cat infra/phase3-outputs.env | grep ORCHESTRATOR_URL | cut -d'=' -f2)

# Update webhook receiver
cd apps/webhook-receiver

gcloud functions deploy webhookReceiver \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point webhookReceiver \
  --trigger-http \
  --allow-unauthenticated \
  --update-env-vars ORCHESTRATOR_URL=$ORCHESTRATOR_URL
```

---

## Step 6: Test with Scripted Scenarios

### A. Run Test Framework

```bash
cd test-scenarios

# Install dependencies
npm install firebase-admin

# Run single scenario
node run-test.js scenario-a-bad-deploy

# Run all scenarios
node run-test.js
```

### B. Review Results

The test framework will:
1. Create incident in Firestore with mocked data
2. Trigger orchestrator
3. Wait for reasoning to complete
4. Compare actual vs expected outcomes
5. Display pass/fail results

**Expected output:**
```
🧪 Running scenario: Scenario A: Bad Deploy (500 Errors)

✅ Incident created
🤖 Agent processing...
✅ Agent completed reasoning

─────────────────────────────────────────
RESULTS FOR scenario-a-bad-deploy
─────────────────────────────────────────

🔍 Hypothesis:
   Suspect: abc1234
   Confidence: high
   Evidence:
     - Error rate spiked to 87.5% at incident start
     - Commit abc1234 deployed 2 minutes before incident
     - Affected service: demo-api

💡 Recommendation:
   Action: ROLLBACK
   Description: Revert commit abc1234

✓ EXPECTED vs ACTUAL:
   Hypothesis suspect: ✅
   Confidence: ✅
   Recommendation: ✅

✅ TEST PASSED
```

---

## Step 7: Test End-to-End with Real Incident

### A. Trigger Incident

```bash
# Get demo API URL
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)

# Enable chaos mode
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate traffic
for i in {1..50}; do
  curl -X POST $API_URL/todos \
    -H "Content-Type: application/json" \
    -d '{"text":"test"}' || true
  sleep 0.5
done
```

### B. Monitor Reasoning

```bash
# Watch Firestore for incidents
firebase firestore:get incidents --limit 1

# Watch orchestrator logs
gcloud functions logs read runReasoningLoop \
  --region us-central1 \
  --limit 50 \
  --follow
```

### C. Check Slack (if configured)

Within 2-3 minutes, you should receive a Slack message with:
- Incident summary
- Hypothesis and evidence
- Recommendation
- Approve/Reject buttons

### D. Approve Action

**Via Slack:** Click "✅ Approve Rollback"

**Via Firestore (if no Slack):**
```javascript
// In Firebase console
incidents/{incidentId}
{
  approvalStatus: "approved"
}
```

### E. Verify Execution

```bash
# Check GitHub for revert commit
git log origin/main --oneline -5

# Check Dynatrace for problem resolution
# Should auto-resolve within 5-10 minutes
```

---

## Step 8: Prompt Engineering (Day 7)

### A. Set Up Test Loop

```bash
# Create prompt iteration workflow
while true; do
  echo "Testing all scenarios..."
  node test-scenarios/run-test.js
  echo ""
  echo "Press Enter to test again after updating prompt..."
  read
done
```

### B. Tune System Prompt

Edit `agent/system-prompt.md` based on test results:

**Common improvements:**
1. **Specificity:** Add examples of good vs bad evidence
2. **Tool guidance:** Clarify when to use each tool
3. **Confidence calibration:** Adjust confidence thresholds
4. **Error handling:** Add guidance for missing data

### C. Iterate

Goal: **All 4 scenarios pass** before moving to Phase 4

---

## Success Criteria

✅ **Phase 3 is complete when:**

### Deployment
- [ ] Agent orchestrator deployed
- [ ] Dynatrace tools configured
- [ ] GitHub MCP deployed
- [ ] Slack bridge deployed (or skipped intentionally)
- [ ] Webhook receiver updated with orchestrator URL

### Testing
- [ ] All 4 test scenarios pass
- [ ] Real incident triggers full reasoning loop
- [ ] Hypothesis formed with evidence
- [ ] Recommendation posted (Slack or dashboard)
- [ ] Approval gate works
- [ ] Rollback executes successfully

### Quality
- [ ] Reasoning steps written to Firestore
- [ ] Agent reasoning is specific (cites evidence)
- [ ] Confidence scores are accurate
- [ ] Tool calls complete within 2 minutes

---

## Troubleshooting

### Orchestrator times out

```bash
# Increase timeout
gcloud functions deploy runReasoningLoop \
  --gen2 \
  --timeout 540s \
  --memory 512MB
```

### Reasoning loop stuck

```bash
# Check Firestore reasoning state
firebase firestore:get incidents/{incidentId}

# Check orchestrator logs
gcloud functions logs read runReasoningLoop --limit 100
```

### GitHub tools fail

```bash
# Verify token
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user

# Check MCP server logs
gcloud run services logs read github-mcp --limit 50
```

### Slack buttons not working

```bash
# Verify interactive endpoint
curl -X POST $SLACK_URL/slack/events

# Check signing secret matches
gcloud functions describe slackEvents \
  --gen2 \
  --format json | jq '.serviceConfig.environmentVariables'
```

---

## Next: Phase 4

Once Phase 3 is verified:
- **Phase 4: Human Interface** - Dashboard + Slack polish
- Real-time incident timeline
- Live reasoning trace
- Approval interface

---

## Quick Commands Reference

```bash
# Deploy Phase 3
cd infra && ./phase3-deploy.sh

# Run test scenarios
cd test-scenarios && node run-test.js

# Trigger real incident
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Monitor orchestrator
gcloud functions logs read runReasoningLoop --region=us-central1 --limit=50 --follow

# View Firestore incidents
firebase firestore:get incidents --limit 5

# Check approval status
firebase firestore:get incidents/{incidentId}
```

---

**Phase 3 Status:** Ready to deploy
**Estimated Time:** 4-6 hours (including prompt iteration)
**Next Step:** Run `bash infra/phase3-deploy.sh`
