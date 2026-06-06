# Phase 3 Quick Start Guide

## What Was Built

All Phase 3 reasoning loop files have been created and are ready for deployment.

### ✅ Created Files

```
apps/agent-orchestrator/
├── index.js                       ✅ Full 5-phase reasoning logic
└── package.json                   ✅ Dependencies

tools/dynatrace-mcp/
├── index.js                       ✅ Dynatrace API MCP wrapper
└── package.json                   ✅ Dependencies

apps/slack-bridge/
├── index.js                       ✅ Approval buttons (already exists)
└── package.json                   ✅ Dependencies (already exists)

test-scenarios/
├── scenarios.json                 ✅ 4 test scenarios (A, B, C, D)
└── run-test.js                    ✅ Test framework

infra/
├── phase3-deploy.sh               ✅ Master deployment script
└── phase3-outputs.env             🔄 Generated after deployment

docs/
└── PHASE3_SETUP.md                ✅ Complete 8-step guide

PHASE3_COMPLETE.md                 ✅ Architecture & summary
PHASE3_QUICKSTART.md               ✅ This file
```

---

## Deploy Phase 3 (2 Options)

### Option 1: One-Command (Recommended)

```bash
cd infra
./phase3-deploy.sh
```

**What it does:**
1. ✅ Deploys agent orchestrator
2. ✅ Deploys Slack bridge (if configured)
3. ✅ Updates webhook receiver
4. ✅ Configures all environment variables
5. ⚠️  Shows manual steps for Slack (if applicable)

### Option 2: Step-by-Step

```bash
# 1. Deploy orchestrator
cd apps/agent-orchestrator
npm install
gcloud functions deploy runReasoningLoop \
  --gen2 --runtime nodejs20 --region us-central1 \
  --source . --entry-point runReasoningLoop \
  --trigger-http --allow-unauthenticated

# 2. Get orchestrator URL
export ORCHESTRATOR_URL=$(gcloud functions describe runReasoningLoop \
  --gen2 --region us-central1 --format 'value(serviceConfig.uri)')

# 3. Update webhook receiver
cd ../webhook-receiver
gcloud functions deploy webhookReceiver \
  --gen2 --update-env-vars ORCHESTRATOR_URL=$ORCHESTRATOR_URL
```

---

## Before You Deploy

### 1. Update Environment Variables

```bash
# Add to .env
GITHUB_TOKEN=github_pat_XXXXXXXXXXXX  # Create at: https://github.com/settings/tokens
GITHUB_REPO_OWNER=Baroskykofi
GITHUB_REPO_NAME=devpulse

# Optional: Slack integration
SLACK_BOT_TOKEN=xoxb-XXXXXXXXXXXX
SLACK_SIGNING_SECRET=XXXXXXXXXXXX
SLACK_CHANNEL=#incidents
```

### 2. Create GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Scopes: `repo`, `read:org`
4. Copy and add to `.env`

### 3. Verify Phase 2 Complete

```bash
# Check webhook receiver exists
gcloud functions describe webhookReceiver --gen2 --region=us-central1

# Should show: status: ACTIVE
```

---

## Test the Reasoning Loop

### Run Test Scenarios

```bash
cd test-scenarios

# Install dependencies
npm install firebase-admin

# Run single scenario
node run-test.js scenario-a-bad-deploy

# Run all scenarios
node run-test.js
```

**Expected:**
```
═══════════════════════════════════════════
SUMMARY
═══════════════════════════════════════════

Tests run: 4
Passed: 4
Failed: 0
Success rate: 100%

  ✅ scenario-a-bad-deploy
  ✅ scenario-b-external-dependency
  ✅ scenario-c-traffic-spike
  ✅ scenario-d-missing-env-var
```

### Test with Real Incident

```bash
# Get demo API URL
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)

# Enable chaos mode
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate traffic
for i in {1..50}; do
  curl -X POST $API_URL/todos -H "Content-Type: application/json" -d '{"text":"test"}' || true
  sleep 0.5
done

# Wait 2-5 minutes for Dynatrace to detect and send webhook
```

### Monitor Reasoning

```bash
# Watch Firestore
firebase firestore:get incidents --limit 1

# Watch orchestrator logs
gcloud functions logs read runReasoningLoop --region=us-central1 --follow

# Check for reasoning steps
firebase firestore:get incidents/{incidentId}
```

---

## Manual Steps (Optional)

### Slack Integration

If you added `SLACK_BOT_TOKEN` to `.env`:

1. **Get Slack Bridge URL**
   ```bash
   export SLACK_URL=$(gcloud functions describe slackEvents \
     --gen2 --region us-central1 --format 'value(serviceConfig.uri)')
   ```

2. **Configure Slack App**
   - Go to https://api.slack.com/apps
   - Select your app
   - **Interactivity & Shortcuts:**
     - Request URL: `$SLACK_URL/slack/events`
   - **Event Subscriptions:**
     - Request URL: `$SLACK_URL`

3. **Test Approval**
   - Trigger incident
   - Check Slack for message with buttons
   - Click "✅ Approve Rollback"

---

## Success Criteria

Phase 3 is complete when:

- [x] All infrastructure files created ✅
- [ ] Orchestrator deployed
- [ ] Slack bridge deployed (or skipped)
- [ ] All test scenarios pass
- [ ] Real incident triggers reasoning loop
- [ ] Approval gate works (Slack or Firestore)

---

## Troubleshooting

### Orchestrator times out

```bash
# Increase timeout
gcloud functions deploy runReasoningLoop \
  --gen2 --timeout 540s --memory 512MB
```

### GitHub token invalid

```bash
# Verify token
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# Regenerate at: https://github.com/settings/tokens
```

### Test scenarios fail

```bash
# Check orchestrator logs
gcloud functions logs read runReasoningLoop --limit 100

# Check Firestore reasoning state
firebase firestore:get incidents --limit 1
```

### No incidents in Firestore

```bash
# Check webhook receiver logs
gcloud functions logs read webhookReceiver --limit 50

# Verify Dynatrace webhook configured
# Settings → Problem notifications → DevPulse Webhook
```

---

## Quick Commands

```bash
# Deploy
cd infra && ./phase3-deploy.sh

# Test all scenarios
cd test-scenarios && node run-test.js

# Trigger incident
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Monitor orchestrator
gcloud functions logs read runReasoningLoop --region=us-central1 --follow

# View incidents
firebase firestore:get incidents --limit 5

# Get orchestrator URL
gcloud functions describe runReasoningLoop --gen2 --region=us-central1 --format 'value(serviceConfig.uri)'
```

---

## Next Steps

1. **Deploy Phase 3:** Run `./infra/phase3-deploy.sh`
2. **Run tests:** Verify all 4 scenarios pass
3. **Test end-to-end:** Trigger real incident
4. **Iterate on prompt:** Achieve 100% test pass rate
5. **Proceed to Phase 4:** Dashboard + UI polish

---

**Quick Links:**
- Full documentation: [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md)
- Architecture & details: [PHASE3_COMPLETE.md](PHASE3_COMPLETE.md)
- Test scenarios: [test-scenarios/scenarios.json](test-scenarios/scenarios.json)
