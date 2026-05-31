# DevPulse — The Solo Developer's On-Call Engineer

> Autonomous incident-response agent that does the first 20 minutes of triage for you.
> Built on Gemini 3 · Google Cloud Agent Builder · Dynatrace MCP · Firebase · Slack.

---

## How it works

```
Dynatrace detects anomaly
        │
        ▼
Webhook Receiver (Cloud Function)
  → creates incident in Firestore
  → invokes Agent Builder agent
        │
        ▼
Agent (Gemini 3 via Agent Builder)
  Phase 1: Observe   → Dynatrace MCP (problem, entities, metrics, logs)
  Phase 2: Correlate → GitHub tool  (recent commits, diffs)
  Phase 3: Hypothesize → writes hypothesis to Firestore
  Phase 4: Recommend → posts to Slack with Approve/Reject buttons
        │
        ▼
Developer approves on phone (Slack) or dashboard
        │
        ▼
Agent executes rollback → monitors Dynatrace until resolved
        │
        ▼
Incident closed · post-mortem written to Firestore
```

The **dashboard** (Next.js) streams reasoning steps from Firestore in real time — so you can watch the agent think.

---

## Repository layout

```
devpulse/
├── apps/
│   ├── dashboard/          Next.js incident UI (Cloud Run)
│   ├── demo-api/           Deliberately breakable Express API (Cloud Run)
│   ├── slack-bridge/       Slack Bolt Cloud Function
│   └── webhook-receiver/   Dynatrace webhook Cloud Function
├── agent/
│   ├── system-prompt.md    Agent playbook
│   ├── tools.json          Tool catalog for Agent Builder
│   └── scenarios/          Scripted test incidents
├── tools/
│   └── github-mcp/         Custom GitHub MCP server
└── infra/
    └── deploy.sh           One-command deploy
```

---

## Quick start (local dev)

### 1. Prerequisites
- Node.js 20+
- Google Cloud CLI (`gcloud`)
- Firebase project (Firestore in Native mode)
- Dynatrace SaaS account
- Slack app with bot token

### 2. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/devpulse.git
cd devpulse
```

### 3. Configure environment
```bash
# Dashboard
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# Fill in your Firebase SDK values

# Backend services — create a root .env
cp .env.example .env
# Fill in all values
```

### 4. Run the dashboard
```bash
cd apps/dashboard
npm install
npm run dev
# → http://localhost:3000
```

### 5. Run the demo API
```bash
cd apps/demo-api
npm install
npm start
# → http://localhost:8080
```

### 6. Trigger a demo incident (no Dynatrace needed locally)
Open the dashboard → click **Replay Scenario** → pick a scenario → watch the reasoning trace stream in.

---

## Deploy to Google Cloud

```bash
# Set env vars first (see .env.example)
source .env
chmod +x infra/deploy.sh
./infra/deploy.sh YOUR_GCP_PROJECT_ID us-central1
```

After deploy, the script prints the URLs you need to paste into:
- Dynatrace → Settings → Problem notifications → Webhook URL
- Slack app → Interactivity & Shortcuts → Request URL

---

## Environment variables

See `.env.example` at the repo root for a complete list with descriptions.

---

## License

MIT
