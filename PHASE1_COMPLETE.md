# ✅ Phase 1: Foundation - COMPLETE

## What We Built

Phase 1 establishes the **foundation** for DevPulse: a monitored demo application that can trigger incidents on demand.

### Deliverables

#### 1. Demo API ✅
- **Location:** `apps/demo-api/`
- **Features:**
  - 4 production endpoints (`/healthz`, `/todos GET/POST`, `/external`)
  - 4 chaos modes (`off`, `errors`, `latency`, `memory`)
  - Express.js with proper error handling
  - Health check for monitoring

#### 2. Cloud Run Deployment ✅
- **Script:** `infra/phase1-deploy.sh`
- **Features:**
  - Automated deployment to Google Cloud Run
  - Dynatrace OneAgent auto-injection
  - Health checks and auto-scaling
  - Public HTTPS endpoint

#### 3. Dynatrace Integration ✅
- **Guide:** `docs/DYNATRACE_SETUP.md`
- **Features:**
  - OneAgent monitoring
  - Automatic problem detection (Davis AI)
  - Service-level metrics (response time, error rate)
  - Infrastructure monitoring

#### 4. Documentation ✅
- **Setup Guide:** `docs/PHASE1_SETUP.md` - Complete walkthrough
- **Dynatrace Guide:** `docs/DYNATRACE_SETUP.md` - Monitoring setup
- **Demo API README:** `apps/demo-api/README.md` - API reference
- **Environment Template:** `.env.phase1.example` - Configuration

---

## Architecture (Phase 1)

```
┌─────────────────────────────────────┐
│         Google Cloud Run            │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     devpulse-demo-api        │  │
│  │                              │  │
│  │  Endpoints:                  │  │
│  │  • /healthz                  │  │
│  │  • /todos (GET/POST)         │  │
│  │  • /external                 │  │
│  │  • /chaos (toggle failures)  │  │
│  │                              │  │
│  │  ┌────────────────────────┐  │  │
│  │  │  Dynatrace OneAgent    │  │  │
│  │  │  (auto-instrumentation)│  │  │
│  │  └───────────┬────────────┘  │  │
│  └──────────────┼───────────────┘  │
└─────────────────┼───────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │   Dynatrace    │
         │    Platform    │
         │                │
         │  • Metrics     │
         │  • Problems    │
         │  • Traces      │
         │  • Logs        │
         └────────────────┘
```

---

## Files Created

```
devpulse/
├── apps/demo-api/
│   ├── index.js                    ✅ Express app with chaos modes
│   ├── package.json                ✅ Dependencies
│   ├── Dockerfile                  ✅ Container definition (enhanced)
│   ├── .dockerignore               ✅ Build exclusions
│   └── README.md                   ✅ API documentation
│
├── infra/
│   ├── phase1-deploy.sh            ✅ Cloud Run deployment script
│   ├── deploy-webhook-receiver.sh  ✅ Webhook deployment (Phase 2)
│   └── phase1-outputs.env          🔄 Generated after deployment
│
├── docs/
│   ├── PHASE1_SETUP.md             ✅ Complete setup guide
│   └── DYNATRACE_SETUP.md          ✅ Dynatrace configuration
│
├── .env.phase1.example             ✅ Environment template
└── PHASE1_COMPLETE.md              ✅ This file
```

---

## How to Deploy Phase 1

### Prerequisites

```bash
# Install tools
gcloud --version  # Google Cloud SDK
node --version    # Node.js 20+

# Login
gcloud auth login
```

### Quick Start

```bash
# 1. Configure environment
cp .env.phase1.example .env
# Edit .env with your GCP_PROJECT_ID and Dynatrace credentials

# 2. Deploy
chmod +x infra/phase1-deploy.sh
./infra/phase1-deploy.sh

# 3. Get API URL
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)

# 4. Test
curl $API_URL/healthz
```

### Full Setup (with Dynatrace)

Follow the detailed guides:
1. **`docs/PHASE1_SETUP.md`** - Complete deployment walkthrough
2. **`docs/DYNATRACE_SETUP.md`** - Dynatrace account and token setup

---

## Testing the Demo API

### Normal Operation

```bash
# Health check
curl $API_URL/healthz

# List todos
curl $API_URL/todos

# Create todo
curl -X POST $API_URL/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"Ship DevPulse"}'
```

### Trigger Incidents

#### Scenario A: Bad Deploy (500 errors)

```bash
# Enable error chaos
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate failing requests
for i in {1..50}; do
  curl -X POST $API_URL/todos -d '{"text":"test"}' || true
  sleep 0.3
done

# Disable chaos
curl -X POST $API_URL/chaos -d '{"mode":"off"}'
```

**Expected in Dynatrace:**
- Error rate: 0% → ~100%
- Problem detected in 2-5 minutes
- Root cause: TypeError in POST /todos

#### Scenario C: Performance Degradation (high latency)

```bash
# Enable latency chaos
curl -X POST $API_URL/chaos -d '{"mode":"latency"}'

# Generate slow requests
for i in {1..30}; do curl $API_URL/todos & done; wait

# Disable chaos
curl -X POST $API_URL/chaos -d '{"mode":"off"}'
```

**Expected in Dynatrace:**
- Response time: ~50ms → 3000-5000ms
- Problem detected: "Response time degradation"

---

## Verification Checklist

✅ **Phase 1 is successful if you can check all these:**

### Deployment
- [ ] Cloud Run service is running: `gcloud run services list`
- [ ] API responds to health check: `curl $API_URL/healthz`
- [ ] Environment variables are set (includes `DT_TENANT`, `DT_API_TOKEN`)

### Dynatrace Monitoring
- [ ] OneAgent appears under **Infrastructure → Hosts**
- [ ] Service appears under **Services** (devpulse-demo-api)
- [ ] Baseline metrics visible (response time, throughput)

### Problem Detection
- [ ] Trigger chaos mode: `curl -X POST $API_URL/chaos -d '{"mode":"errors"}'`
- [ ] Generate traffic: `for i in {1..50}; do curl -X POST $API_URL/todos -d '{"text":"t"}'; done`
- [ ] Problem appears in **Dynatrace → Problems** (within 5 minutes)
- [ ] Problem details show error rate spike and root cause

### Documentation
- [ ] All scripts are executable: `chmod +x infra/*.sh`
- [ ] `.env` file created with your credentials
- [ ] Service URL saved in `infra/phase1-outputs.env`

---

## Metrics & Observability

Once deployed, you can observe in Dynatrace:

### Service Dashboard
- **URL:** Dynatrace → Services → devpulse-demo-api
- **Metrics:**
  - Response time (p50, p95, p99)
  - Throughput (requests/min)
  - Error rate (%)
  - Database calls (none for this simple app)

### Problem Detection
- **URL:** Dynatrace → Problems
- **Trigger conditions:**
  - Error rate > 5% for 2 minutes
  - Response time p95 > 2000ms for 2 minutes

### Distributed Traces
- **URL:** Dynatrace → Distributed traces
- Shows end-to-end request flow
- Useful for debugging the `/external` endpoint

---

## Common Issues & Solutions

### Issue: Cloud Run deployment fails

```bash
# Check build logs
gcloud builds list --limit 5
gcloud builds log <BUILD_ID>

# Verify project billing is enabled
gcloud beta billing accounts list
```

### Issue: Dynatrace not showing data

```bash
# Verify OneAgent env vars
gcloud run services describe devpulse-demo-api \
  --region us-central1 \
  --format json | jq '.spec.template.spec.containers[0].env'

# Check logs for OneAgent initialization
gcloud run services logs read devpulse-demo-api \
  --region us-central1 | grep -i dynatrace
```

### Issue: No problems detected

- Verify alerting profile is enabled (Settings → Anomaly detection)
- Lower error rate threshold to 2% instead of 5%
- Ensure enough traffic is generated (50+ requests)
- Wait full 5 minutes for Davis AI analysis

---

## Cost Estimate

**Free tier usage for testing:**
- Cloud Run: **2M requests/month free**
- Cloud Build: **120 build-minutes/day free**
- Firestore: **1GB storage free**
- Dynatrace: **15-day free trial** (full-featured)

**After free tier (light usage):**
- Cloud Run: ~$5/month (for demo traffic)
- Dynatrace: ~$74/month per full-stack host (production)

**For hackathon:** Everything stays within free tiers if cleaned up after 2 weeks.

---

## Cleanup (if needed)

```bash
# Delete Cloud Run service
gcloud run services delete devpulse-demo-api \
  --region us-central1 \
  --quiet

# Delete container images
gcloud container images delete \
  gcr.io/$GCP_PROJECT_ID/devpulse-demo-api \
  --quiet

# Cancel Dynatrace trial
# Go to Dynatrace dashboard → Manage → Cancel subscription
```

---

## What's Next: Phase 2

With Phase 1 complete, you can now:

### Phase 2: Agent Brain (Days 3-5)
- Deploy **webhook-receiver** Cloud Function
- Set up **Google Cloud Agent Builder**
- Connect **Dynatrace MCP** server
- Build **GitHub MCP** tool
- Test agent can receive and process problem alerts

**Start Phase 2:**
```bash
# Deploy webhook receiver
chmod +x infra/deploy-webhook-receiver.sh
./infra/deploy-webhook-receiver.sh

# Configure Dynatrace webhook
# Add webhook URL to Dynatrace problem notification
```

**Documentation:**
- See `docs/PHASE2_SETUP.md` (to be created)
- Production plan: **DevPulse_Production_Plan.md** → Phase 2

---

## Resources

### Documentation
- [Phase 1 Setup Guide](docs/PHASE1_SETUP.md)
- [Dynatrace Setup Guide](docs/DYNATRACE_SETUP.md)
- [Demo API README](apps/demo-api/README.md)

### External Links
- [Dynatrace Free Trial](https://www.dynatrace.com/trial/)
- [Google Cloud Run Docs](https://cloud.google.com/run/docs)
- [Dynatrace OneAgent](https://www.dynatrace.com/support/help/setup-and-configuration/dynatrace-oneagent)

---

## Summary

**Phase 1 deliverables:** ✅ Complete

- ✅ Demo API with chaos engineering endpoints
- ✅ Containerized deployment to Cloud Run
- ✅ Dynatrace OneAgent monitoring
- ✅ Automated problem detection
- ✅ Complete documentation

**Total time to deploy:** ~15-30 minutes (after Dynatrace account setup)

**Ready for Phase 2:** ✅ Yes

---

**Built with:** Node.js 20 · Express.js · Google Cloud Run · Dynatrace

**DevPulse** — The Solo Developer's On-Call Engineer
