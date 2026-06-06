# ✅ Phase 2: Agent Brain - READY FOR DEPLOYMENT

## What We Built

Phase 2 establishes the **intelligent agent infrastructure** for DevPulse: Firebase backend, webhook receiver, and Agent Builder configuration for autonomous incident response.

### Deliverables

#### 1. Firebase & Firestore Setup ✅
- **Scripts:**
  - `infra/setup-firebase.sh` - Automated Firebase initialization
  - `firestore.rules` - Security rules for data access
  - `firestore.indexes.json` - Database indexes for queries
- **Features:**
  - Firestore database in production mode
  - Real-time incident storage
  - Reasoning step tracking
  - Service account with proper permissions

#### 2. Webhook Receiver Cloud Function ✅
- **Location:** `apps/webhook-receiver/`
- **Scripts:** `infra/deploy-webhook-receiver.sh`
- **Features:**
  - Receives Dynatrace problem webhooks
  - Creates Firestore incident documents
  - Invokes Agent Builder agent (fire-and-forget)
  - Handles problem state changes (OPEN, RESOLVED)
  - Replay scenario support for testing

#### 3. Agent Builder Configuration ✅
- **Scripts:** `infra/setup-agent-builder.sh`
- **Configuration Files:**
  - `agent/system-prompt.md` - Agent reasoning playbook
  - `agent/tools.json` - Tool definitions for the agent
- **Features:**
  - Gemini 1.5 Pro integration
  - Multi-phase reasoning (Observe → Correlate → Hypothesize → Recommend → Execute)
  - Safety guardrails (max 15 tool calls, approval gates)
  - Real-time Firestore updates

#### 4. GitHub MCP Server ✅
- **Location:** `tools/github-mcp/`
- **Scripts:** `infra/deploy-github-mcp.sh`
- **Features:**
  - List recent commits
  - Get commit diffs
  - Revert commits (with approval gate)
  - MCP protocol integration

#### 5. Documentation ✅
- **Setup Guide:** `docs/PHASE2_SETUP.md` - Complete 8-step walkthrough
- **Environment Template:** `.env.phase2.example` - Phase 2 configuration
- **Deployment Script:** `infra/phase2-deploy.sh` - One-command deployment
- **Completion Summary:** `PHASE2_COMPLETE.md` - This file

---

## Architecture (Phase 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dynatrace                                │
│                  (Problem Detection)                            │
└────────────────────────┬────────────────────────────────────────┘
                         │ Webhook (problem alert)
                         ▼
              ┌──────────────────────┐
              │  Webhook Receiver    │
              │  (Cloud Function)    │
              │                      │
              │  • Validate payload  │
              │  • Create incident   │
              │  • Invoke agent      │
              └──────────┬───────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌──────────────────┐          ┌──────────────────────┐
│   Firestore DB   │          │  Agent Builder       │
│                  │          │  (Gemini 1.5 Pro)    │
│  incidents/      │◄─────────┤                      │
│    {id}/         │  writes  │  System Prompt       │
│      steps/      │          │  + Tools             │
│        {stepId}  │          │                      │
└──────────────────┘          └──────┬───────────────┘
         │                           │
         │                           │ Tool calls
         │                           ▼
         │              ┌────────────────────────────┐
         │              │   MCP Tools                │
         │              │                            │
         │              │  • Dynatrace API (HTTP)    │
         │              │  • GitHub MCP (Cloud Run)  │
         │              │  • Firestore (built-in)    │
         │              └────────────────────────────┘
         ▼
┌──────────────────┐
│  Dashboard       │
│  (Real-time UI)  │
│                  │
│  • Incident list │
│  • Reasoning     │
│  • Approve/Reject│
└──────────────────┘
```

---

## Files Created

```
devpulse/
├── apps/webhook-receiver/
│   ├── index.js                      ✅ Cloud Function entry point
│   ├── package.json                  ✅ Dependencies
│   └── scenarios.json                ✅ Replay scenarios
│
├── agent/
│   ├── system-prompt.md              ✅ Agent reasoning playbook
│   └── tools.json                    ✅ Tool definitions
│
├── tools/github-mcp/
│   ├── index.js                      ✅ MCP server implementation
│   ├── package.json                  ✅ Dependencies
│   └── Dockerfile                    🔄 Generated during deployment
│
├── infra/
│   ├── setup-firebase.sh             ✅ Firebase initialization
│   ├── deploy-webhook-receiver.sh    ✅ Webhook deployment
│   ├── setup-agent-builder.sh        ✅ Agent Builder guide
│   ├── deploy-github-mcp.sh          ✅ GitHub MCP deployment
│   ├── phase2-deploy.sh              ✅ Master deployment script
│   ├── phase2-outputs.env            🔄 Generated after deployment
│   └── phase1-outputs.env            ✅ From Phase 1
│
├── docs/
│   └── PHASE2_SETUP.md               ✅ Complete setup guide
│
├── firestore.rules                   ✅ Security rules
├── firestore.indexes.json            🔄 Generated during setup
├── firebase.json                     🔄 Generated during setup
├── .env.phase2.example               ✅ Environment template
└── PHASE2_COMPLETE.md                ✅ This file
```

---

## How to Deploy Phase 2

### Prerequisites

```bash
# Phase 1 must be complete
gcloud run services describe devpulse-demo-api --region us-central1

# Required tools
firebase --version  # Firebase CLI
gcloud --version    # Google Cloud SDK
node --version      # Node.js 20+
```

### Quick Start (One-Command Deployment)

```bash
# 1. Configure environment
cat .env.phase1.example .env.phase2.example > .env
# Edit .env with your actual values

# 2. Deploy entire Phase 2
cd infra
chmod +x phase2-deploy.sh
./phase2-deploy.sh
```

### Step-by-Step Deployment

```bash
# Step 1: Firebase & Firestore
cd infra
./setup-firebase.sh

# Step 2: Deploy webhook receiver
./deploy-webhook-receiver.sh

# Step 3: Configure Agent Builder (manual)
./setup-agent-builder.sh
# Follow the console instructions

# Step 4: Deploy GitHub MCP (optional for Phase 2)
./deploy-github-mcp.sh

# Step 5: Configure Dynatrace webhook
# Add webhook URL to Dynatrace → Settings → Problem notifications
```

---

## Testing Phase 2

### 1. Test Webhook Receiver

```bash
# Get webhook URL
export WEBHOOK_URL=$(cat infra/phase2-outputs.env | grep WEBHOOK_RECEIVER_URL | cut -d'=' -f2)

# Send test payload
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "TEST-001",
    "problemTitle": "Test incident",
    "state": "OPEN",
    "severityLevel": "ERROR",
    "impactedEntityNames": ["demo-api"]
  }'

# Expected: {"incidentId":"TEST-001-...","status":"created"}
```

### 2. Verify Firestore

```bash
# Check incident created
firebase firestore:get incidents --limit 1

# Or visit console
echo "https://console.firebase.google.com/project/$GCP_PROJECT_ID/firestore"
```

### 3. Trigger Real Incident

```bash
# Get demo API URL
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)

# Enable chaos mode
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate failing traffic
for i in {1..50}; do
  curl -X POST $API_URL/todos \
    -H "Content-Type: application/json" \
    -d '{"text":"test"}' || true
  sleep 0.5
done

# Wait 2-5 minutes for Dynatrace to detect problem
# Check Firestore for new incident
```

### 4. Check Webhook Logs

```bash
# View recent logs
gcloud functions logs read webhookReceiver \
  --gen2 \
  --region us-central1 \
  --limit 50

# Look for:
# - "[webhook] received: ..."
# - "[webhook] created incident ..."
# - "[agent] invocation error..." (if agent not configured yet)
```

---

## Environment Variables Reference

### Required for Phase 2

```bash
# Phase 1 (already configured)
GCP_PROJECT_ID=devpulse
GCP_REGION=us-central1
DYNATRACE_ENVIRONMENT_ID=hhv66215.live.dynatrace.com
DYNATRACE_API_KEY=dt0c01.XXXX...

# Firebase
FIREBASE_PROJECT_ID=devpulse
FIRESTORE_PROJECT_ID=devpulse

# Agent Builder (add after creating agent)
AGENT_BUILDER_PROJECT=devpulse
AGENT_BUILDER_LOCATION=us-central1
AGENT_BUILDER_AGENT_ID=projects/.../locations/.../agents/...

# GitHub (for MCP server - optional in Phase 2)
GITHUB_TOKEN=github_pat_XXXX...
GITHUB_REPO_OWNER=Baroskykofi
GITHUB_REPO_NAME=devpulse
```

---

## Success Criteria

✅ **Phase 2 is complete when:**

### Infrastructure
- [ ] Firebase project linked to GCP project
- [ ] Firestore database created with security rules
- [ ] Service account created with Firestore permissions
- [ ] Firebase CLI authenticated and initialized

### Webhook Receiver
- [ ] Cloud Function `webhookReceiver` deployed
- [ ] Function URL accessible via HTTPS
- [ ] Test webhook creates Firestore document
- [ ] Function logs show successful execution

### Agent Builder
- [ ] Agent Builder APIs enabled
- [ ] Agent created in console
- [ ] System prompt configured from `agent/system-prompt.md`
- [ ] Dynatrace tools registered (HTTP)
- [ ] Agent ID added to `.env`

### Integration
- [ ] Dynatrace webhook configured with function URL
- [ ] Real incident triggers webhook
- [ ] Incident appears in Firestore
- [ ] Agent invocation logged (even if fails without tools)

---

## Verification Checklist

```bash
# 1. Firebase/Firestore
gcloud firestore databases describe --project=$GCP_PROJECT_ID
# Should show: state: ACTIVE

# 2. Webhook receiver
gcloud functions describe webhookReceiver --gen2 --region=us-central1
# Should show: state: ACTIVE

# 3. Firestore security rules
firebase deploy --only firestore:rules --project=$GCP_PROJECT_ID
# Should show: Deploy complete!

# 4. Test end-to-end
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"problemId":"VERIFY-001","state":"OPEN","severityLevel":"ERROR"}'

firebase firestore:get incidents --limit 1
# Should show the VERIFY-001 incident
```

---

## What's Next: Phase 3

With Phase 2 complete, the agent infrastructure is deployed. Phase 3 implements the full reasoning loop:

### Phase 3: Reasoning Loop (Days 6-8)
- **Observe Phase:** Pull metrics, logs, entities from Dynatrace
- **Correlate Phase:** Analyze time-series data, identify anomalies
- **Hypothesize Phase:** Scan recent commits, correlate with metrics
- **Recommend Phase:** Generate actionable rollback plan
- **Execute & Verify Phase:** Revert with approval, verify resolution

**Start Phase 3:**
```bash
# See production plan section: Days 6-8
# Focus: Prompt engineering and tool orchestration
```

---

## Troubleshooting

### Firebase initialization fails

```bash
# Re-login to Firebase
firebase login --reauth

# Check project access
firebase projects:list

# Manually set project
firebase use --add $GCP_PROJECT_ID
```

### Webhook receiver fails to deploy

```bash
# Check Cloud Functions API is enabled
gcloud services enable cloudfunctions.googleapis.com

# View deployment logs
gcloud functions deploy webhookReceiver \
  --gen2 \
  --region us-central1 \
  --source apps/webhook-receiver \
  --entry-point webhookReceiver \
  --trigger-http \
  --verbosity debug
```

### No incidents in Firestore

```bash
# Check webhook receiver logs
gcloud functions logs read webhookReceiver --limit 50

# Test webhook manually
curl -X POST $WEBHOOK_URL -d '{"problemId":"TEST","state":"OPEN","severityLevel":"ERROR"}'

# Check Firestore rules allow writes from Cloud Function
firebase deploy --only firestore:rules
```

### Agent Builder not invoking

```bash
# Verify agent ID in .env
echo $AGENT_BUILDER_AGENT_ID

# Check Agent Builder logs
gcloud logging read \
  "resource.type=dialogflow_agent" \
  --limit 50 \
  --project=$GCP_PROJECT_ID

# Verify API is enabled
gcloud services list --enabled | grep dialogflow
```

---

## Cost Estimate

**Free tier usage (Phase 2 added):**
- Cloud Functions: **2M invocations/month free**
- Firestore: **1GB storage + 50K reads/day free**
- Agent Builder: **Free during preview** (check current pricing)
- Cloud Run (from Phase 1): **2M requests/month free**

**After free tier (light usage):**
- Cloud Functions: ~$0.40/million requests
- Firestore: ~$0.18/GB + $0.06/100K reads
- Agent Builder: Check https://cloud.google.com/agent-builder/pricing

**For hackathon:** Should stay within free tier with moderate testing.

---

## Cleanup (if needed)

```bash
# Delete webhook receiver
gcloud functions delete webhookReceiver --gen2 --region us-central1 --quiet

# Delete Firestore database
gcloud firestore databases delete --database=(default) --project=$GCP_PROJECT_ID

# Remove Firebase project (careful - irreversible!)
# firebase projects:delete $GCP_PROJECT_ID
```

---

## Resources

### Documentation
- [Phase 2 Setup Guide](docs/PHASE2_SETUP.md)
- [Phase 1 Complete](PHASE1_COMPLETE.md)
- [Production Plan](DevPulse_Production_Plan.md)

### External Links
- [Firebase Console](https://console.firebase.google.com)
- [Agent Builder Console](https://console.cloud.google.com/gen-app-builder/engines)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Cloud Functions](https://cloud.google.com/functions/docs)

---

## Summary

**Phase 2 deliverables:** ✅ Ready for deployment

- ✅ Firebase & Firestore infrastructure scripts
- ✅ Webhook receiver Cloud Function
- ✅ Agent Builder configuration guide
- ✅ GitHub MCP server implementation
- ✅ Deployment automation scripts
- ✅ Complete documentation

**Total deployment time:** ~30-45 minutes (mostly waiting for deployments)

**Ready for Phase 3:** ✅ Yes (after Agent Builder manual setup)

---

**Built with:** Firebase · Cloud Functions · Agent Builder · Gemini 1.5 Pro · Firestore

**DevPulse** — The Solo Developer's On-Call Engineer
