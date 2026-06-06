# Phase 2 Quick Start Guide

## What Was Built

All Phase 2 infrastructure files have been created and are ready for deployment:

### ✅ Created Files

```
infra/
├── setup-firebase.sh              ✅ Firebase initialization
├── deploy-webhook-receiver.sh     ✅ Webhook deployment
├── setup-agent-builder.sh         ✅ Agent Builder guide
├── deploy-github-mcp.sh           ✅ GitHub MCP deployment
└── phase2-deploy.sh               ✅ Master deployment script

agent/
├── system-prompt.md               ✅ Already exists
└── tools.json                     ✅ Already exists

apps/webhook-receiver/
├── index.js                       ✅ Already exists
├── package.json                   ✅ Already exists
└── scenarios.json                 ✅ Already exists

tools/github-mcp/
├── index.js                       ✅ Already exists
└── package.json                   ✅ Already exists

docs/
└── PHASE2_SETUP.md                ✅ Complete setup guide

├── firestore.rules                ✅ Security rules
├── .env.phase2.example            ✅ Environment template
├── PHASE2_COMPLETE.md             ✅ Architecture & docs
└── PHASE2_QUICKSTART.md           ✅ This file
```

---

## Deploy Phase 2 (3 Options)

### Option 1: One-Command Deployment (Recommended)

```bash
cd infra
./phase2-deploy.sh
```

This will:
1. ✅ Set up Firebase & Firestore
2. ✅ Deploy webhook receiver
3. ⚠️  Show Agent Builder setup instructions (manual)
4. ⚠️  Show Dynatrace webhook configuration (manual)

### Option 2: Step-by-Step

```bash
cd infra

# Step 1: Firebase (automated)
./setup-firebase.sh

# Step 2: Webhook receiver (automated)
./deploy-webhook-receiver.sh

# Step 3: Agent Builder (manual setup required)
./setup-agent-builder.sh

# Step 4: Dynatrace webhook (manual configuration)
# See PHASE2_SETUP.md Step 7
```

### Option 3: Manual (Full Control)

Follow the complete guide: [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md)

---

## Before You Deploy

### 1. Update Environment Variables

```bash
# Copy Phase 2 variables to .env
cat .env.phase2.example >> .env

# Edit .env and add:
# - FIREBASE_PROJECT_ID (same as GCP_PROJECT_ID)
# - FIRESTORE_PROJECT_ID (same as GCP_PROJECT_ID)
# - GITHUB_TOKEN (if deploying GitHub MCP)
```

### 2. Verify Phase 1 is Complete

```bash
# Check demo API is deployed
gcloud run services describe devpulse-demo-api --region=us-central1

# Should show: status: Ready
```

---

## After Deployment

### Test the Webhook Receiver

```bash
# Get webhook URL
export WEBHOOK_URL=$(gcloud functions describe webhookReceiver \
  --gen2 --region=us-central1 \
  --format 'value(serviceConfig.uri)')

# Test it
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "TEST-001",
    "problemTitle": "Test incident",
    "state": "OPEN",
    "severityLevel": "ERROR",
    "impactedEntityNames": ["demo-api"]
  }'

# Expected output:
# {"incidentId":"TEST-001-...","status":"created"}
```

### Verify in Firestore

```bash
# View incidents
firebase firestore:get incidents --limit 5

# Or open console
echo "https://console.firebase.google.com/project/$GCP_PROJECT_ID/firestore"
```

---

## Manual Steps Required

### 1. Agent Builder Setup (15 minutes)

After running `./infra/setup-agent-builder.sh`, complete these steps manually:

1. **Create Agent**
   - Open: https://console.cloud.google.com/gen-app-builder/engines
   - Click "Create App" → Agent
   - Name: `devpulse-incident-agent`
   - Region: `us-central1`
   - Model: Gemini 1.5 Pro

2. **Configure System Prompt**
   - Copy content from `agent/system-prompt.md`
   - Paste into Agent Instructions field

3. **Add Tools**
   - Use definitions from `agent/tools.json`
   - Add Dynatrace tools as HTTP tools
   - See [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md) Step 5

4. **Get Agent ID**
   - Copy from URL: `projects/{project}/locations/{location}/agents/{id}`
   - Add to `.env`:
     ```bash
     AGENT_BUILDER_AGENT_ID=projects/.../locations/.../agents/...
     ```

### 2. Dynatrace Webhook (5 minutes)

Configure Dynatrace to send alerts:

1. **Open Dynatrace**
   ```bash
   echo "https://$DYNATRACE_ENVIRONMENT_ID"
   ```

2. **Navigate to Settings → Integrations → Problem notifications**

3. **Add notification** → Custom integration

4. **Configuration:**
   - Name: `DevPulse Webhook`
   - Webhook URL: `$WEBHOOK_URL` (from above)
   - Payload:
     ```json
     {
       "problemId": "{ProblemID}",
       "problemTitle": "{ProblemTitle}",
       "state": "{State}",
       "severityLevel": "{ProblemSeverity}",
       "impactedEntityNames": {ImpactedEntityNames}
     }
     ```
   - Headers: `Content-Type: application/json`
   - Alerting profile: `DevPulse Incidents`

5. **Save**

---

## Troubleshooting

### Firebase login required

```bash
firebase login --reauth
```

### Permission denied

```bash
# Grant yourself owner role
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="user:your-email@gmail.com" \
  --role="roles/owner"
```

### Webhook deployment fails

```bash
# Check Cloud Functions API
gcloud services enable cloudfunctions.googleapis.com

# Redeploy with debug
cd apps/webhook-receiver
gcloud functions deploy webhookReceiver \
  --gen2 --region=us-central1 \
  --runtime nodejs20 \
  --source . \
  --entry-point webhookReceiver \
  --trigger-http \
  --allow-unauthenticated \
  --verbosity debug
```

---

## Quick Commands Reference

```bash
# Deploy entire Phase 2
cd infra && ./phase2-deploy.sh

# Test webhook
curl -X POST $WEBHOOK_URL -H "Content-Type: application/json" \
  -d '{"problemId":"TEST","state":"OPEN","severityLevel":"ERROR"}'

# View Firestore data
firebase firestore:get incidents --limit 10

# Check function logs
gcloud functions logs read webhookReceiver --gen2 --region=us-central1 --limit=20

# Trigger test incident (from Phase 1)
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'
```

---

## Success Criteria

Phase 2 is complete when:

- [x] All infrastructure files created ✅
- [ ] Firebase/Firestore deployed
- [ ] Webhook receiver deployed
- [ ] Agent Builder agent created
- [ ] Dynatrace webhook configured
- [ ] Test incident creates Firestore document

---

## Next Steps

1. **Deploy Phase 2:** Run `./infra/phase2-deploy.sh`
2. **Complete manual setup:** Agent Builder + Dynatrace webhook
3. **Test end-to-end:** Trigger incident, verify in Firestore
4. **Proceed to Phase 3:** Reasoning loop implementation

---

**Quick Links:**
- Full documentation: [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md)
- Architecture & details: [PHASE2_COMPLETE.md](PHASE2_COMPLETE.md)
- Phase 1 recap: [PHASE1_COMPLETE.md](PHASE1_COMPLETE.md)
