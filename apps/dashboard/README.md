# DevPulse — Dashboard (`apps/dashboard`)

Next.js 14 (App Router) frontend for the DevPulse incident-response agent.
Deployed on Cloud Run. Reads live data from Firestore.

## Pages

| Route | Description |
|---|---|
| `/` | **Incidents List** — all incidents, live Firestore subscription |
| `/incidents/[id]` | **Incident Detail** — live reasoning trace + hypothesis + approval buttons |

## Firestore schema

See [`lib/firestore.ts`](./lib/firestore.ts) — the full schema is documented at the top of that file.
The agent writes to this schema via `write_reasoning_step` and the other Firestore tool calls.

## Local dev

```bash
cp .env.local.example .env.local
# fill in your Firebase project values

npm install
npm run dev
# → http://localhost:3000
```

## Deploy to Cloud Run

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT/devpulse-dashboard
gcloud run deploy devpulse-dashboard \
  --image gcr.io/YOUR_PROJECT/devpulse-dashboard \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id,...
```

Set `--min-instances 1` to avoid cold-start lag during the demo.
