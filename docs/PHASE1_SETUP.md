# Phase 1: Foundation Setup Guide

This guide walks you through setting up the **demo API** and **Dynatrace monitoring** for DevPulse.

---

## Prerequisites

### 1. Install Required Tools

```bash
# Google Cloud SDK
# Download from: https://cloud.google.com/sdk/docs/install

# Verify installation
gcloud --version

# Node.js 20+
node --version
npm --version
```

### 2. Create Google Cloud Project

```bash
# Login to Google Cloud
gcloud auth login

# Create new project (or use existing)
gcloud projects create devpulse-demo --name="DevPulse Demo"

# Set as active project
gcloud config set project devpulse-demo

# Enable billing
# Go to: https://console.cloud.google.com/billing
# Link your project to a billing account
```

---

## Step 1: Configure Environment

```bash
# From devpulse/ root directory
cp .env.phase1.example .env

# Edit .env and fill in:
# - GCP_PROJECT_ID: your Google Cloud project ID
# - GCP_REGION: deployment region (default: us-central1)
```

---

## Step 2: Sign Up for Dynatrace

### Create Free Trial Account

1. Go to [Dynatrace Free Trial](https://www.dynatrace.com/trial/)
2. Sign up for a **15-day free trial** (no credit card required)
3. Choose **SaaS** deployment (not Managed)
4. Select region closest to your Cloud Run region

### Get Dynatrace Credentials

After signup, get these values:

#### A. Environment ID
- Found in Dynatrace URL: `https://{YOUR_ENV_ID}.live.dynatrace.com`
- Example: `abc12345.live.dynatrace.com`

#### B. PaaS Token (for OneAgent installation)
1. Dynatrace → **Settings** → **Integration** → **Platform as a Service**
2. Click **Generate new token**
3. Give it a name: `devpulse-cloud-run`
4. Copy the token (starts with `dt0c01.`)

#### C. API Token (for webhook and MCP later)
1. Dynatrace → **Access Tokens** → **Generate new token**
2. Token name: `devpulse-api`
3. Required scopes:
   - ✅ `problems.read`
   - ✅ `entities.read`
   - ✅ `metrics.read`
   - ✅ `logs.read`
4. Click **Generate**
5. Copy the token

### Update `.env`

```bash
DYNATRACE_ENVIRONMENT_ID=abc12345.live.dynatrace.com
DYNATRACE_API_TOKEN=dt0c01.XXXX  # PaaS token from step B
DYNATRACE_API_KEY=dt0c01.YYYY    # API token from step C
```

---

## Step 3: Deploy Demo API to Cloud Run

```bash
# Make deployment script executable
chmod +x infra/phase1-deploy.sh

# Run deployment
./infra/phase1-deploy.sh
```

The script will:
1. Enable required GCP APIs (Cloud Run, Cloud Build)
2. Build Docker container for demo-api
3. Deploy to Cloud Run with Dynatrace OneAgent
4. Output the service URL

**Expected output:**
```
====================================
  Phase 1 Deployment Complete!
====================================

Demo API URL: https://devpulse-demo-api-XXXX-uc.a.run.app

Test endpoints:
  Health check:  curl https://devpulse-demo-api-XXXX-uc.a.run.app/healthz
  Get todos:     curl https://devpulse-demo-api-XXXX-uc.a.run.app/todos
  ...
```

---

## Step 4: Verify Dynatrace Monitoring

### Check OneAgent Installation

1. Go to Dynatrace → **Infrastructure** → **Hosts**
2. Wait 2-3 minutes for the Cloud Run instance to appear
3. You should see: **devpulse-demo-api** (Cloud Run service)

### View Service Monitoring

1. Dynatrace → **Services**
2. Find: **devpulse-demo-api**
3. You should see:
   - Response time charts
   - Throughput
   - Error rate (should be 0% initially)

If Dynatrace is **not showing data**:
- Check environment variables in Cloud Run console
- Verify `DT_TENANT` and `DT_API_TOKEN` are set
- Check Cloud Run logs: `gcloud run services logs read devpulse-demo-api --region us-central1`

---

## Step 5: Test Chaos Endpoints

### Generate Baseline Traffic

```bash
# Save your API URL
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)

# Generate normal requests
for i in {1..20}; do
  curl -X POST $API_URL/todos \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"Task $i\"}"
  sleep 0.5
done
```

### Trigger Error Mode (Scenario A: Bad Deploy)

```bash
# Enable chaos mode: errors
curl -X POST $API_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"errors"}'

# Expected response:
# {"mode":"errors","active":true}

# Generate requests that will fail
for i in {1..50}; do
  curl -X POST $API_URL/todos \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"Task $i\"}"
  sleep 0.3
done
```

**Expected behavior:**
- All POST /todos requests return **500 Internal Server Error**
- Error message: `Cannot read properties of undefined (reading 'userId')`

### Trigger Latency Mode (Scenario C: Traffic Spike)

```bash
# Enable chaos mode: latency
curl -X POST $API_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"latency"}'

# Generate slow requests
for i in {1..20}; do
  curl $API_URL/todos &
done
wait
```

**Expected behavior:**
- Requests take 3-5 seconds to respond
- Dynatrace shows p99 latency spike

### Disable Chaos Mode

```bash
curl -X POST $API_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"off"}'
```

---

## Step 6: Verify Problem Detection in Dynatrace

### Wait for Davis AI

After triggering chaos modes:
1. Wait **2-5 minutes** for Dynatrace Davis AI to detect anomalies
2. Go to Dynatrace → **Problems**
3. You should see new problem(s):
   - **Error rate increase** (from "errors" mode)
   - **Response time degradation** (from "latency" mode)

### Examine Problem Details

Click on a problem to see:
- **Root cause analysis** by Davis AI
- **Affected services**: devpulse-demo-api
- **Timeline** of the incident
- **Metric charts** showing the spike

---

## Step 7: Endpoints Reference

| Endpoint | Method | Description | Example |
|----------|--------|-------------|---------|
| `/healthz` | GET | Health check (always returns 200) | `curl $API_URL/healthz` |
| `/todos` | GET | List all todos | `curl $API_URL/todos` |
| `/todos` | POST | Create new todo | `curl -X POST $API_URL/todos -d '{"text":"Ship it"}'` |
| `/external` | GET | Calls flaky upstream (simulates dependency outage) | `curl $API_URL/external` |
| `/chaos` | POST | Toggle failure mode | `curl -X POST $API_URL/chaos -d '{"mode":"errors"}'` |

### Chaos Modes

| Mode | Effect | Use Case |
|------|--------|----------|
| `off` | Normal operation | Baseline |
| `errors` | POST /todos throws 500 errors | Scenario A: Bad deploy |
| `latency` | All requests delayed 3-5 seconds | Scenario C: Performance degradation |
| `memory` | Leaks 5MB every 2 seconds | Scenario D: Memory leak |

---

## Troubleshooting

### Cloud Run deployment fails

```bash
# Check Cloud Build logs
gcloud builds list --limit 5

# View specific build
gcloud builds log <BUILD_ID>
```

### Dynatrace not showing data

```bash
# Check Cloud Run environment variables
gcloud run services describe devpulse-demo-api \
  --region us-central1 \
  --format json | jq '.spec.template.spec.containers[0].env'

# Should show:
# - DT_TENANT
# - DT_API_TOKEN

# Check logs
gcloud run services logs read devpulse-demo-api \
  --region us-central1 \
  --limit 50
```

### API returns 404

```bash
# Verify service is running
gcloud run services list

# Check service health
curl $API_URL/healthz
```

---

## Success Criteria

✅ **Phase 1 is complete when:**

1. Demo API is deployed to Cloud Run and responds to `/healthz`
2. Dynatrace dashboard shows the service under **Services**
3. Triggering "errors" chaos mode generates 500s
4. Dynatrace detects a **Problem** within 5 minutes
5. Problem details show error rate spike and affected service

---

## Next Steps

Once Phase 1 is verified:
- **Phase 2**: Set up webhook receiver and agent invocation
- **Phase 3**: Implement agent reasoning loop
- **Phase 4**: Build Slack integration

---

## Quick Cleanup (if needed)

```bash
# Delete Cloud Run service
gcloud run services delete devpulse-demo-api \
  --region us-central1 \
  --quiet

# Delete container images
gcloud container images delete gcr.io/$GCP_PROJECT_ID/devpulse-demo-api \
  --quiet
```
