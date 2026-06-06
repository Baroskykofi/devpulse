# Phase 2: Agent Brain Setup Guide

This guide walks you through setting up the **agent infrastructure** that powers DevPulse's autonomous incident response.

---

## Overview

Phase 2 builds the "brain" of DevPulse:
- **Firebase/Firestore** - State management and reasoning trace storage
- **Webhook Receiver** - Receives Dynatrace problem alerts
- **Google Cloud Agent Builder** - Hosts the Gemini 3-powered agent
- **Dynatrace MCP** - Observability tools for the agent
- **GitHub MCP** - Version control tools for the agent

---

## Prerequisites

✅ **Phase 1 completed:**
- Demo API deployed to Cloud Run
- Dynatrace monitoring active
- Problems detected successfully

✅ **Required accounts:**
- Google Cloud Platform (same project as Phase 1)
- Firebase (will be set up)
- GitHub (for repository access)

---

## Step 1: Set Up Firebase & Firestore

### A. Create Firebase Project

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com
   - Click **Add project**

2. **Link to Existing GCP Project**
   - **Project name:** Select `devpulse` (your existing GCP project)
   - Click **Continue**
   - **Enable Google Analytics:** No (optional, not needed)
   - Click **Add Firebase**

### B. Enable Firestore

1. **Navigate to Firestore Database**
   - In Firebase console → **Build** → **Firestore Database**
   - Click **Create database**

2. **Configure Firestore**
   - **Mode:** Start in **production mode** (we'll add security rules later)
   - **Location:** `us-central1` (same as Cloud Run)
   - Click **Enable**

3. **Firestore is now ready** - You should see an empty database

### C. Get Firebase Credentials

1. **Project Settings**
   - Click gear icon ⚙️ → **Project settings**
   - Scroll to **Your apps** section
   - Click **Web app** icon `</>`

2. **Register App**
   - **App nickname:** `devpulse-dashboard`
   - **Firebase Hosting:** No
   - Click **Register app**

3. **Copy Configuration**
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "devpulse.firebaseapp.com",
     projectId: "devpulse",
     storageBucket: "devpulse.appspot.com",
     messagingSenderId: "...",
     appId: "1:...:web:..."
   };
   ```

4. **Update `.env`**
   ```bash
   # Add to your .env file
   FIRESTORE_PROJECT_ID=devpulse
   FIREBASE_PROJECT_ID=devpulse

   # For dashboard (add to apps/dashboard/.env.local)
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=devpulse.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=devpulse
   NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:...
   ```

---

## Step 2: Deploy Firestore Security Rules

Create proper security rules to protect your data:

```bash
# Create firestore.rules file
cat > firestore.rules << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Incidents - read-only from clients, write from backend only
    match /incidents/{incidentId} {
      allow read: if true;  // Public dashboard (add auth later if needed)
      allow create, update, delete: if false;  // Only Cloud Functions can write

      // Reasoning steps
      match /steps/{stepId} {
        allow read: if true;
        allow write: if false;
      }
    }

    // Replay requests - dashboard can create, functions can update
    match /replay_requests/{requestId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['scenarioId', 'requestedAt', 'status'])
                    && request.resource.data.status == 'pending';
      allow update, delete: if false;
    }

    // Allow incident approval updates from dashboard
    match /incidents/{incidentId} {
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['approvalStatus'])
                    && request.resource.data.approvalStatus in ['approved', 'rejected'];
    }
  }
}
EOF

# Deploy rules
firebase deploy --only firestore:rules
```

---

## Step 3: Deploy Webhook Receiver Cloud Function

The webhook receiver accepts Dynatrace problem alerts and triggers the agent.

### A. Install Firebase CLI

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
cd "c:\Users\Gbegbeawu Daniel\Downloads\devpulse"
firebase init

# Select:
# - Firestore: Configure security rules
# - Functions: Configure Cloud Functions
#
# Use existing project: devpulse
# Language: JavaScript
# ESLint: No
# Install dependencies: Yes
```

### B. Update `.env` with Required Variables

Add to your `.env` file:

```bash
# ── Firebase ─────────────────────────────────────────────────────────
FIRESTORE_PROJECT_ID=devpulse
FIREBASE_PROJECT_ID=devpulse

# ── Agent Builder (we'll set this up next) ──────────────────────────
AGENT_BUILDER_PROJECT=devpulse
AGENT_BUILDER_LOCATION=us-central1
AGENT_BUILDER_AGENT_ID=  # Will be filled after creating agent
```

### C. Deploy Webhook Receiver

```bash
# Deploy the webhook receiver function
bash infra/deploy-webhook-receiver.sh
```

**Expected output:**
```
Webhook receiver deployed!
URL: https://us-central1-devpulse.cloudfunctions.net/webhookReceiver

Configure this URL in Dynatrace:
  Settings → Integrations → Problem notifications → Custom integration
  Webhook URL: https://us-central1-devpulse.cloudfunctions.net/webhookReceiver
```

### D. Test Webhook Receiver

```bash
# Get the webhook URL
export WEBHOOK_URL=$(cat infra/phase1-outputs.env | grep WEBHOOK_RECEIVER_URL | cut -d'=' -f2)

# Send a test payload
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "TEST-001",
    "problemTitle": "Test incident",
    "state": "OPEN",
    "severityLevel": "ERROR",
    "impactedEntityNames": ["demo-api"]
  }'

# Should return: {"incidentId":"TEST-001-...","status":"created"}
```

### E. Verify in Firestore

1. Go to Firebase Console → Firestore Database
2. You should see:
   - Collection: `incidents`
   - Document: `TEST-001-...`
   - Fields: `status`, `severity`, `title`, etc.

---

## Step 4: Set Up Google Cloud Agent Builder

### A. Enable Required APIs

```bash
# Enable Agent Builder and Vertex AI APIs
gcloud services enable \
  aiplatform.googleapis.com \
  dialogflow.googleapis.com \
  --project devpulse
```

### B. Create Agent Builder Agent

**Option 1: Via Console (Recommended for first time)**

1. **Go to Agent Builder**
   - Visit: https://console.cloud.google.com/gen-app-builder/engines
   - Select project: `devpulse`

2. **Create New Agent**
   - Click **Create App**
   - **App type:** Agent
   - **Agent name:** `devpulse-incident-agent`
   - **Region:** `us-central1`
   - **Model:** Gemini 1.5 Pro (or latest available)

3. **Configure Agent**
   - **Agent instructions:** Copy from `agent/system-prompt.md`
   - **Tools:** We'll add these next

4. **Get Agent ID**
   - After creation, note the Agent ID (format: `projects/.../locations/.../agents/...`)
   - Add to `.env`:
     ```bash
     AGENT_BUILDER_AGENT_ID=<your-agent-id>
     ```

**Option 2: Via CLI**

```bash
# Create agent via gcloud
gcloud alpha dialogflow agents create \
  --display-name="devpulse-incident-agent" \
  --location=us-central1 \
  --default-language-code=en \
  --time-zone="America/New_York"
```

---

## Step 5: Connect Dynatrace MCP Server

The Dynatrace MCP server gives the agent access to problems, metrics, and logs.

### A. Install Dynatrace MCP

**Note:** As of Phase 2, Dynatrace MCP integration is done through Agent Builder's tool configuration.

We'll configure the agent to use Dynatrace API directly through HTTP tool calls.

### B. Register Dynatrace Tools in Agent Builder

1. **Go to Agent Builder Console**
   - Navigate to your agent: `devpulse-incident-agent`
   - Click **Tools** tab

2. **Add HTTP Tool for each Dynatrace endpoint**

Create tools based on `agent/tools.json`:

#### Tool 1: get_problem_details

```json
{
  "name": "get_problem_details",
  "description": "Fetch full context for a Dynatrace problem ID",
  "parameters": {
    "type": "object",
    "properties": {
      "problemId": {
        "type": "string",
        "description": "The Dynatrace problem ID (e.g., P-230948)"
      }
    },
    "required": ["problemId"]
  },
  "http": {
    "method": "GET",
    "url": "https://{{DYNATRACE_ENVIRONMENT_ID}}/api/v2/problems/{{problemId}}",
    "headers": {
      "Authorization": "Api-Token {{DYNATRACE_API_KEY}}"
    }
  }
}
```

Repeat for:
- `get_affected_entities`
- `query_metrics`
- `fetch_logs`

(See `agent/tools.json` for complete tool definitions)

---

## Step 6: Deploy GitHub MCP Server

### A. Configure GitHub Token

Add to `.env`:

```bash
# ── GitHub ───────────────────────────────────────────────────────────
GITHUB_TOKEN=github_pat_XXXXXXXXXXXXXXXXXXXX  # Create at: https://github.com/settings/tokens
GITHUB_REPO_OWNER=Baroskykofi
GITHUB_REPO_NAME=devpulse
```

### B. Deploy GitHub MCP Tool

The GitHub MCP server is already implemented in `tools/github-mcp/`.

**Deploy as Cloud Function:**

```bash
cd tools/github-mcp

# Deploy
gcloud functions deploy github-mcp \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point handler \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars GITHUB_TOKEN=$GITHUB_TOKEN \
  --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID

# Get function URL
gcloud functions describe github-mcp \
  --gen2 \
  --region us-central1 \
  --format 'value(serviceConfig.uri)'
```

### C. Register GitHub Tools in Agent Builder

Add these tools to Agent Builder (similar to Dynatrace tools):

- `list_recent_commits`
- `get_commit_diff`
- `revert_commit`

---

## Step 7: Configure Dynatrace Webhook

Now that webhook-receiver is deployed, update Dynatrace to send alerts.

### A. Get Webhook URL

```bash
cat infra/phase1-outputs.env | grep WEBHOOK_RECEIVER_URL
```

### B. Configure in Dynatrace

1. **Dynatrace → Settings → Integration → Problem notifications**
2. Click **Add notification**
3. **Type:** Custom integration
4. **Configuration:**
   - **Name:** DevPulse Webhook
   - **Webhook URL:** `https://us-central1-devpulse.cloudfunctions.net/webhookReceiver`
   - **Payload:**
     ```json
     {
       "problemId": "{ProblemID}",
       "problemTitle": "{ProblemTitle}",
       "state": "{State}",
       "severityLevel": "{ProblemSeverity}",
       "impactedEntityNames": {ImpactedEntityNames}
     }
     ```
   - **HTTP Headers:**
     - `Content-Type: application/json`
   - **Alerting profile:** DevPulse Incidents (created in Phase 1)
5. **Save**

### C. Test Webhook Integration

Trigger an incident and verify:

```bash
# 1. Enable chaos mode
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# 2. Generate traffic
for i in {1..50}; do
  curl -X POST $API_URL/todos -d '{"text":"test"}' || true
  sleep 0.3
done

# 3. Check Firestore for incident
# Go to Firebase Console → Firestore
# Should see new incident document within 2-5 minutes
```

---

## Step 8: Test End-to-End Flow

### A. Manual Test

1. **Trigger incident** (chaos mode)
2. **Wait for Dynatrace** to detect problem (2-5 min)
3. **Check Firestore** - incident document created
4. **Check Cloud Function logs:**
   ```bash
   gcloud functions logs read webhookReceiver \
     --region us-central1 \
     --limit 50
   ```

### B. Verify Agent Invocation

Check Agent Builder logs:

```bash
# View agent execution logs
gcloud logging read \
  "resource.type=cloud_function AND resource.labels.function_name=webhookReceiver" \
  --limit 20 \
  --format json
```

---

## Success Criteria

✅ **Phase 2 is complete when:**

- [ ] Firebase/Firestore database created and accessible
- [ ] Webhook receiver deployed and responding to POST requests
- [ ] Test incident creates Firestore document
- [ ] Google Cloud Agent Builder agent created
- [ ] Agent system prompt configured
- [ ] Dynatrace tools registered in Agent Builder
- [ ] GitHub tools registered in Agent Builder
- [ ] Dynatrace webhook configured to call Cloud Function
- [ ] Real incident triggers agent invocation

---

## Troubleshooting

### Webhook receiver not deploying

```bash
# Check Firebase CLI is installed
firebase --version

# Re-login to Firebase
firebase login --reauth

# Check deployment logs
firebase deploy --only functions --debug
```

### Firestore permission denied

```bash
# Check security rules
firebase deploy --only firestore:rules

# Verify service account permissions
gcloud projects get-iam-policy devpulse
```

### Agent Builder not invoking

```bash
# Check agent exists
gcloud alpha dialogflow agents list --location=us-central1

# View agent logs
gcloud logging read "resource.type=dialogflow_agent" --limit 50
```

---

## Next: Phase 3

Once Phase 2 is verified:
- **Phase 3: Reasoning Loop** - Implement full observe → correlate → hypothesize → recommend flow
- Prompt engineering and optimization
- Action execution (rollback)

---

## Quick Commands Reference

```bash
# Deploy webhook receiver
bash infra/deploy-webhook-receiver.sh

# Test webhook
curl -X POST $WEBHOOK_URL -H "Content-Type: application/json" \
  -d '{"problemId":"TEST","state":"OPEN","severityLevel":"ERROR"}'

# View Firestore data
firebase firestore:get incidents --limit 10

# Check function logs
gcloud functions logs read webhookReceiver --region us-central1 --limit 20

# Trigger test incident
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'
```

---

**Phase 2 Status:** Ready to implement
**Estimated Time:** 3-4 hours
**Next Step:** Run `bash infra/setup-firebase.sh` (we'll create this next)
