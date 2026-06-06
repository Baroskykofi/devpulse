# Deploy All DevPulse Services at Once

This guide shows you how to deploy all 4 services (Demo API, Webhook Receiver, Dynatrace Tools, Dashboard) with a **single push to GitHub**.

---

## How It Works

The `cloudbuild.yaml` file contains a complete build pipeline that:

1. ✅ **Builds** all 4 Docker images in parallel
2. ✅ **Pushes** all images to Google Container Registry
3. ✅ **Deploys** all services to Cloud Run simultaneously
4. ✅ **Runs automatically** whenever you push to GitHub

**Total deployment time:** ~8-12 minutes for all services

---

## Setup (One-Time)

### Step 1: Push Code to GitHub

```bash
cd "c:\Users\Gbegbeawu Daniel\Downloads\devpulse"

git add .
git commit -m "feat: Add unified Cloud Build deployment"
git push origin main
```

### Step 2: Create Cloud Build Trigger

1. **Open Cloud Build Triggers:**
   https://console.cloud.google.com/cloud-build/triggers?project=devpaulse

2. **Click "CREATE TRIGGER"**

3. **Configure Trigger:**
   - **Name:** `deploy-devpulse-all`
   - **Description:** `Deploy all DevPulse services`
   - **Event:** Push to a branch
   - **Source:** 1st gen
   - **Repository:** Click "CONNECT NEW REPOSITORY"

4. **Connect Repository:**
   - Select source: **GitHub (Cloud Build GitHub App)**
   - Click "CONTINUE"
   - Authenticate with GitHub
   - Select repository: `Baroskykofi/devpulse`
   - Click "CONNECT"
   - Click "DONE"

5. **Configuration:**
   - **Branch:** `^main$`
   - **Configuration:** Cloud Build configuration file (yaml or json)
   - **Location:** Repository
   - **Cloud Build configuration file location:** `cloudbuild.yaml`

6. **Substitution variables** (OPTIONAL - already in cloudbuild.yaml):
   These are pre-configured in the file, but you can override them here if needed:
   ```
   _REGION = us-central1
   _DYNATRACE_ENVIRONMENT_ID = hhv66215.live.dynatrace.com
   _FIRESTORE_PROJECT_ID = devpulse-a3550
   _AGENT_BUILDER_AGENT_ID = ec726e22-6a27-4d3b-bea6-947a11380b09
   ```
   *(All other values are already in the yaml)*

7. **Service account:**
   - Leave as default (Cloud Build service account)

8. **Click "CREATE"**

---

## Deploy Everything

### Option A: Push to GitHub (Automatic)

```bash
# Make any change
echo "# DevPulse" >> README.md

# Commit and push
git add .
git commit -m "trigger: Deploy all services"
git push origin main
```

**Cloud Build will automatically:**
- Build all 4 services in parallel
- Deploy everything to Cloud Run
- Complete in ~8-12 minutes

### Option B: Manual Trigger (No Code Change Needed)

1. **Go to Cloud Build Triggers:**
   https://console.cloud.google.com/cloud-build/triggers?project=devpaulse

2. **Find your trigger:** `deploy-devpulse-all`

3. **Click "RUN"** → **"RUN TRIGGER"**

---

## Monitor Deployment

### Watch Build Progress

**Open Cloud Build:**
https://console.cloud.google.com/cloud-build/builds?project=devpaulse

You'll see:
- ✅ **Build Phase** - 4 Docker images building in parallel (3-5 min)
- ✅ **Push Phase** - Pushing to GCR (1-2 min)
- ✅ **Deploy Phase** - All 4 services deploying to Cloud Run (4-6 min)

**Click on the build** to see detailed logs for each step.

### Check Cloud Run Services

**Open Cloud Run:**
https://console.cloud.google.com/run?project=devpaulse

After deployment completes, you should see all 4 services:
- ✅ **devpulse-demo-api** - Ready
- ✅ **devpulse-webhook-receiver** - Ready
- ✅ **devpulse-dynatrace-tools** - Ready
- ✅ **devpulse-dashboard** - Ready

---

## Get Service URLs

After deployment, get all URLs:

```bash
# Set project
gcloud config set project devpaulse

# Get all service URLs
echo "Demo API:"
gcloud run services describe devpulse-demo-api --region=us-central1 --format='value(status.url)'

echo "Webhook Receiver:"
gcloud run services describe devpulse-webhook-receiver --region=us-central1 --format='value(status.url)'

echo "Dynatrace Tools:"
gcloud run services describe devpulse-dynatrace-tools --region=us-central1 --format='value(status.url)'

echo "Dashboard:"
gcloud run services describe devpulse-dashboard --region=us-central1 --format='value(status.url)'
```

Or view in Cloud Run console:
https://console.cloud.google.com/run?project=devpaulse

---

## Test Deployment

### Test Demo API

```bash
export DEMO_API_URL=$(gcloud run services describe devpulse-demo-api --region=us-central1 --format='value(status.url)')

# Health check
curl $DEMO_API_URL/healthz

# Get todos
curl $DEMO_API_URL/todos
```

### Test Webhook Receiver

```bash
export WEBHOOK_URL=$(gcloud run services describe devpulse-webhook-receiver --region=us-central1 --format='value(status.url)')

# Send test incident
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "TEST-001",
    "problemTitle": "Test incident",
    "state": "OPEN",
    "severityLevel": "ERROR"
  }'
```

### Open Dashboard

```bash
export DASHBOARD_URL=$(gcloud run services describe devpulse-dashboard --region=us-central1 --format='value(status.url)')

echo "Open in browser: $DASHBOARD_URL"
```

---

## What Gets Deployed

| Service | Image | Cloud Run Service | Port |
|---------|-------|-------------------|------|
| Demo API | `gcr.io/devpaulse/devpulse-demo-api` | `devpulse-demo-api` | 8080 |
| Webhook | `gcr.io/devpaulse/devpulse-webhook-receiver` | `devpulse-webhook-receiver` | 8080 |
| Tools | `gcr.io/devpaulse/devpulse-dynatrace-tools` | `devpulse-dynatrace-tools` | 8080 |
| Dashboard | `gcr.io/devpaulse/devpulse-dashboard` | `devpulse-dashboard` | 3000 |

---

## Continuous Deployment

Once set up, every push to `main` branch will:

1. ✅ Trigger Cloud Build automatically
2. ✅ Build all changed services (and dependencies)
3. ✅ Deploy new versions to Cloud Run
4. ✅ Gradually shift traffic (no downtime)
5. ✅ Keep previous versions for instant rollback

**Example workflow:**
```bash
# Make code changes
vim apps/demo-api/index.js

# Commit and push
git add .
git commit -m "fix: Update API endpoint"
git push origin main

# Cloud Build automatically deploys!
```

---

## Rollback

If something goes wrong:

1. **Go to Cloud Run service:**
   https://console.cloud.google.com/run/detail/us-central1/devpulse-demo-api/revisions?project=devpaulse

2. **Click "REVISIONS" tab**

3. **Find previous working revision**

4. **Click "⋮" menu → "Manage traffic"**

5. **Route 100% traffic to previous revision**

Or via command line:
```bash
# List revisions
gcloud run revisions list --service=devpulse-demo-api --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic devpulse-demo-api \
  --to-revisions=devpulse-demo-api-00001-abc=100 \
  --region=us-central1
```

---

## Cost Estimate

**Cloud Build:**
- First 120 build-minutes/day: Free
- This deployment: ~10 minutes
- Cost: $0 (within free tier)

**Cloud Run:**
- 2M requests/month: Free
- 360,000 GB-seconds/month: Free
- With min instances = 0: Only pay when handling requests

**Storage (GCR):**
- First 0.5 GB: Free
- ~2 GB for all images: ~$0.10/month

**Total estimated cost:** < $1/month for development

---

## Troubleshooting

### Build fails

**Check logs:**
https://console.cloud.google.com/cloud-build/builds?project=devpaulse

**Common issues:**
- ❌ Missing Dockerfile → Check all exist in `/apps/*/Dockerfile`
- ❌ Docker build error → Check package.json and dependencies
- ❌ Permission denied → Check Cloud Build service account permissions

### Deployment fails

**Check Cloud Run logs:**
Click service → LOGS tab

**Common issues:**
- ❌ Container crashes → Check environment variables
- ❌ Port mismatch → Verify PORT in Dockerfile matches Cloud Run config
- ❌ Out of memory → Increase memory limit

### Trigger doesn't run

**Verify:**
1. Trigger is enabled (check Cloud Build Triggers page)
2. Repository is connected (re-authenticate if needed)
3. Branch name matches `^main$` regex

---

## Summary

✅ **One trigger** → Deploys everything
✅ **Push to GitHub** → Automatic deployment
✅ **Parallel builds** → Fast deployment (~8-12 min)
✅ **Zero downtime** → Gradual traffic shifting
✅ **Easy rollback** → Previous revisions saved
✅ **Full logging** → Build and runtime logs

**Next steps:**
1. Create Cloud Build trigger (one-time setup)
2. Push to GitHub
3. Watch everything deploy!
4. Configure Dynatrace webhook with your webhook receiver URL
