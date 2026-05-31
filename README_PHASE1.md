# DevPulse - Phase 1: Foundation ✅

> **Status:** Phase 1 Complete - Ready for Deployment
> 
> **Goal:** Deploy a monitored demo API that can trigger incidents on demand

---

## 🚀 Quick Start

```bash
# 1. Setup environment
cp .env.phase1.example .env
# Edit .env with your GCP project ID and Dynatrace credentials

# 2. Deploy to Cloud Run
chmod +x infra/phase1-deploy.sh
./infra/phase1-deploy.sh

# 3. Test the API
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)
curl $API_URL/healthz
```

---

## 📁 Project Structure

```
devpulse/
├── apps/
│   ├── demo-api/               ← Phase 1: Breakable test API
│   │   ├── index.js            ✅ Express app with chaos modes
│   │   ├── Dockerfile          ✅ Cloud Run container
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── dashboard/              🎯 Frontend (already built)
│   │   └── ...                 React/Next.js dashboard
│   │
│   ├── webhook-receiver/       📋 Phase 2: Alert handler
│   ├── slack-bridge/           📋 Phase 4: Slack integration
│   └── demo-api/               ✅ Phase 1

├── infra/
│   ├── phase1-deploy.sh        ✅ Deploy demo-api
│   └── deploy-webhook-receiver.sh  📋 Phase 2

├── docs/
│   ├── PHASE1_SETUP.md         ✅ Complete setup guide
│   └── DYNATRACE_SETUP.md      ✅ Monitoring configuration

├── .env.phase1.example         ✅ Environment template
├── PHASE1_COMPLETE.md          ✅ Phase 1 summary
└── README.md                   (this file)
```

Legend: ✅ Complete | 📋 Upcoming | 🎯 Already Built

---

## 📚 Documentation

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [PHASE1_SETUP.md](docs/PHASE1_SETUP.md) | Complete deployment walkthrough | First-time setup |
| [DYNATRACE_SETUP.md](docs/DYNATRACE_SETUP.md) | Dynatrace account & monitoring | Before deployment |
| [PHASE1_COMPLETE.md](PHASE1_COMPLETE.md) | What we built, architecture, testing | Reference |
| [apps/demo-api/README.md](apps/demo-api/README.md) | API endpoints & chaos modes | API testing |

---

## 🎯 What Phase 1 Delivers

### 1. Demo API with Chaos Engineering
- **4 Production Endpoints:** Health, todos, external calls
- **4 Chaos Modes:** Errors, latency, memory leak, off
- **Cloud Run Deployment:** Auto-scaling, HTTPS, health checks

### 2. Dynatrace Monitoring
- **OneAgent:** Auto-instrumentation for Node.js
- **Metrics:** Response time, error rate, throughput
- **Problem Detection:** Davis AI detects anomalies in 2-5 min

### 3. Infrastructure as Code
- **Automated Deployment:** One-command Cloud Run deploy
- **Environment Config:** Template with all required variables
- **Webhook Placeholder:** Ready for Phase 2 agent integration

---

## 🧪 Testing Scenarios

### Scenario A: Bad Deploy (500 Errors)

```bash
# Trigger error chaos
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate failing requests
for i in {1..50}; do
  curl -X POST $API_URL/todos -d '{"text":"test"}' || true
done

# Expected: Dynatrace detects "Error rate increase" problem
```

### Scenario C: Performance Degradation

```bash
# Trigger latency chaos
curl -X POST $API_URL/chaos -d '{"mode":"latency"}'

# Generate slow requests
for i in {1..30}; do curl $API_URL/todos & done; wait

# Expected: Dynatrace detects "Response time degradation"
```

---

## ✅ Success Criteria

Phase 1 is complete when you can verify:

- [ ] Demo API deployed to Cloud Run
- [ ] `curl $API_URL/healthz` returns 200 OK
- [ ] Dynatrace shows service under **Services**
- [ ] Chaos mode generates 500 errors
- [ ] Dynatrace creates a **Problem** alert
- [ ] Problem details show error rate spike

---

## 🔜 Next: Phase 2

With Phase 1 working, you're ready to build the **agent brain**:

### Phase 2: Agent Brain (Days 3-5)
1. Deploy webhook-receiver Cloud Function
2. Set up Google Cloud Agent Builder
3. Connect Dynatrace MCP server  
4. Build custom GitHub MCP tool
5. Test end-to-end problem → agent → reasoning

**Start Phase 2:**
```bash
./infra/deploy-webhook-receiver.sh
# Then follow docs/PHASE2_SETUP.md (to be created)
```

---

## 💰 Cost (Free Tier)

| Service | Free Tier | Phase 1 Usage |
|---------|-----------|---------------|
| Cloud Run | 2M req/month | ~1000 req/day |
| Cloud Build | 120 min/day | ~5 min/deploy |
| Dynatrace | 15-day trial | Full features |

**Total cost for hackathon:** $0 (within free tiers)

---

## 🛠️ Troubleshooting

### Cloud Run not deploying
```bash
gcloud builds list --limit 5
gcloud builds log <BUILD_ID>
```

### Dynatrace not showing data
```bash
gcloud run services describe devpulse-demo-api \
  --region us-central1 \
  --format yaml | grep -A 5 env:
```

### No problems detected
- Lower error threshold: Settings → Anomaly detection → 2%
- Generate more traffic: 50+ requests
- Wait full 5 minutes

---

## 📞 Support

**Documentation:**
- Phase 1 Setup: `docs/PHASE1_SETUP.md`
- Dynatrace Guide: `docs/DYNATRACE_SETUP.md`

**External:**
- [Dynatrace Support](https://www.dynatrace.com/support/)
- [Cloud Run Docs](https://cloud.google.com/run/docs)

---

**DevPulse** — Built with Node.js · Express · Cloud Run · Dynatrace
