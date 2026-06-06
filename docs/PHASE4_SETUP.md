# Phase 4: Human Interface Setup Guide

This guide walks you through deploying the **dashboard** and polishing the **human interface** for DevPulse.

---

## Overview

Phase 4 delivers the user-facing interface:
- **Real-time dashboard** - Live incident timeline, approval interface
- **Mobile-optimized** - Phone-friendly for on-call
- **Dark ops theme** - Professional monitoring aesthetic
- **Slack polish** - Enhanced Block Kit messages with deep links

---

## Prerequisites

✅ **Phase 3 completed:**
- Agent orchestrator deployed
- Slack bridge deployed (optional)
- Reasoning loop functional

✅ **Firebase credentials:**
- Get from Firebase console → Project settings → Your apps

---

## Step 1: Configure Firebase for Dashboard

### A. Get Firebase Credentials

1. **Open Firebase Console**
   - Visit: https://console.firebase.google.com
   - Select project: `devpulse`

2. **Navigate to Project Settings**
   - Click gear icon ⚙️ → Project settings
   - Scroll to **Your apps**

3. **If No Web App Exists, Create One**
   - Click web icon `</>`
   - App nickname: `devpulse-dashboard`
   - Firebase Hosting: No
   - Click Register app

4. **Copy Firebase Configuration**
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "devpulse.firebaseapp.com",
     projectId: "devpulse",
     appId: "1:...:web:..."
   };
   ```

### B. Update Environment Variables

Add to your main `.env` file:
```bash
# ── Dashboard (Phase 4) ──────────────────────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=devpulse.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=devpulse
NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:...
```

---

## Step 2: Deploy Dashboard to Cloud Run

### A. One-Command Deployment (Recommended)

```bash
cd infra
./phase4-deploy.sh
```

This will:
1. Install dependencies
2. Build Next.js production bundle
3. Deploy to Cloud Run
4. Update Slack bridge with dashboard URL

### B. Manual Deployment

```bash
cd apps/dashboard

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
EOF

# Install and build
npm install
npm run build

# Deploy to Cloud Run
gcloud run deploy devpulse-dashboard \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --set-env-vars NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
  --set-env-vars NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
  --set-env-vars NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
  --set-env-vars NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# Get dashboard URL
export DASHBOARD_URL=$(gcloud run services describe devpulse-dashboard \
  --region us-central1 \
  --format 'value(status.url)')

echo $DASHBOARD_URL
# Save for later use
```

---

## Step 3: Test the Dashboard

### A. Open in Browser

```bash
# Get URL
export DASHBOARD_URL=$(gcloud run services describe devpulse-dashboard \
  --region us-central1 \
  --format 'value(status.url)')

echo "Dashboard: $DASHBOARD_URL"
# Open in browser
```

### B. Verify Features

**Incidents List Page:**
- [ ] Summary bar shows active/critical/pending counts
- [ ] Empty state displays "All clear — no incidents"
- [ ] "Replay Scenario" button opens modal
- [ ] Clicking incident navigates to detail page

**Incident Detail Page:**
- [ ] Header shows severity, title, Dynatrace problem ID
- [ ] Metrics bar displays error rate, p99 latency, requests/min
- [ ] Reasoning timeline displays (empty initially)
- [ ] Right panel shows hypothesis and recommendation
- [ ] Approval buttons present (if pending approval)

### C. Test Real-Time Updates

**Terminal 1: Trigger incident**
```bash
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate traffic
for i in {1..50}; do
  curl -X POST $API_URL/todos -H "Content-Type: application/json" -d '{"text":"test"}' || true
  sleep 0.5
done
```

**Browser: Watch dashboard**
- Wait 2-5 minutes for Dynatrace to detect
- Incident should appear in list automatically (no refresh needed!)
- Click incident → watch reasoning steps appear live
- Approve/reject buttons should appear when recommendation ready

---

## Step 4: Test on Mobile

### A. Open on Phone

1. **Get dashboard URL** (from Step 2)
2. **Open in mobile browser** (Chrome, Safari)
3. **Add to home screen** (optional - for quick access)

### B. Test Mobile Workflow

**Scenario: Late-night incident**
1. Receive Slack notification on phone
2. Tap notification → opens Slack
3. Tap "View Details" button → opens dashboard in browser
4. Review reasoning timeline
5. Tap "Approve" or "Reject"
6. See confirmation modal

**Expected:**
- Dashboard loads fast (<2s)
- Text is readable (no zooming needed)
- Buttons are thumb-sized
- Scrolling is smooth
- Approval works with one tap

---

## Step 5: Enhanced Slack Integration

If you configured Slack in Phase 3, enhance the messages with dashboard links.

### A. Update Slack Bridge

```bash
# Get dashboard URL
export DASHBOARD_URL=$(gcloud run services describe devpulse-dashboard \
  --region us-central1 \
  --format 'value(status.url)')

# Update Slack bridge
cd apps/slack-bridge

gcloud functions deploy slackEvents \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point slackEvents \
  --trigger-http \
  --allow-unauthenticated \
  --update-env-vars DASHBOARD_URL=$DASHBOARD_URL
```

### B. Test Slack Notification

**Trigger incident:**
```bash
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'
# Generate traffic...
```

**Check Slack:**
- Notification should include "View Details" button
- Button links to `$DASHBOARD_URL/incidents/{incidentId}`
- Approve/Reject buttons work
- Message updates after approval

---

## Step 6: Replay Scenarios (Demo Mode)

The dashboard includes a "Replay Scenario" feature for demos and testing.

### A. Access Replay Modal

1. Open dashboard
2. Click "Replay Scenario" button (top right)
3. Select scenario:
   - **Scenario A** - Bad deploy (500 errors)
   - **Scenario B** - External dependency outage
   - **Scenario C** - Traffic spike (high latency)
   - **Scenario D** - Missing env var after config push

4. Click "Run Scenario"

### B. What Happens

1. **Scripted incident created** in Firestore
2. **Agent triggered** with pre-defined data
3. **Reasoning steps** appear (faster than real incident)
4. **Hypothesis and recommendation** formed
5. **Approval required** (test the flow)

**Use cases:**
- Demo for stakeholders
- Test UI changes
- Practice approval workflow
- Video recording for submission

---

## Step 7: Customize Dashboard (Optional)

### A. Change Theme Colors

Edit `apps/dashboard/app/globals.css`:

```css
:root {
  --red:    #ff5555;  /* Critical incidents */
  --amber:  #ffb86c;  /* Warnings */
  --green:  #50fa7b;  /* Resolved */
  --blue:   #8be9fd;  /* Agent states */
  --purple: #bd93f9;  /* Hypothesis phase */
}
```

### B. Add Company Logo

Edit `apps/dashboard/components/TopBar.tsx`:

```tsx
<img src="/logo.png" alt="Your Company" style={{ height: 24 }} />
```

Add `public/logo.png` to the dashboard directory.

### C. Customize Status Labels

Edit `apps/dashboard/app/page.tsx` - modify the `severityBadge` and `agentState` functions.

---

## Success Criteria

✅ **Phase 4 is complete when:**

### Dashboard
- [ ] Dashboard deployed to Cloud Run
- [ ] Incidents list page loads and displays real-time data
- [ ] Incident detail page shows live reasoning timeline
- [ ] Approval buttons work (dashboard-only mode)
- [ ] Summary bar displays correct counts

### Mobile
- [ ] Dashboard loads fast on phone (<3s)
- [ ] All text is readable without zooming
- [ ] Approval buttons are tap-friendly
- [ ] Scrolling is smooth
- [ ] No horizontal scrolling required

### Slack (if configured)
- [ ] Notifications include "View Details" button
- [ ] Button links to correct incident
- [ ] Approve/Reject buttons work
- [ ] Messages update after approval

### Testing
- [ ] Replay scenarios work
- [ ] Real incidents display correctly
- [ ] Live updates appear without refresh
- [ ] Approval flow completes end-to-end

---

## Troubleshooting

### Dashboard won't load

```bash
# Check Cloud Run logs
gcloud run services logs read devpulse-dashboard \
  --region us-central1 \
  --limit 100

# Common issues:
# - Firebase credentials not set
# - Build failed (check build logs)
# - Firestore rules too restrictive
```

### Firestore connection error

```bash
# Verify credentials
echo $NEXT_PUBLIC_FIREBASE_PROJECT_ID

# Check Firestore rules
firebase deploy --only firestore:rules

# Test Firestore access
# Open browser console on dashboard, check for errors
```

### Incidents not appearing

```bash
# Check webhook receiver
gcloud functions logs read webhookReceiver --limit 50

# Check Firestore has data
firebase firestore:get incidents --limit 1

# Verify real-time subscriptions
# Open browser DevTools → Network tab → look for WebSocket connections
```

### Approval buttons don't work

```bash
# Check Firestore rules allow updates
# Rule should allow:
# allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['approvalStatus'])

# Check browser console for errors
```

---

## Performance Optimization

### A. Enable Cloud Run Min Instances (For Demo)

```bash
# Set min instances = 1 to avoid cold starts
gcloud run services update devpulse-dashboard \
  --region us-central1 \
  --min-instances 1

# Cost: ~$5/month for 1 instance
# Benefit: Dashboard loads instantly
```

### B. Configure CDN (Optional)

For production, add Cloud CDN for static assets:

```bash
# Enable Cloud CDN for Cloud Run
gcloud compute backend-services update devpulse-dashboard \
  --enable-cdn \
  --global

# Cache static assets for 1 hour
```

---

## Next: Polish & Submission

With Phase 4 complete, the product is fully functional:
- **Day 11:** End-to-end dogfooding
- **Day 12:** Repo cleanup & licensing
- **Day 13:** Demo video
- **Day 14:** Submission

---

## Quick Commands Reference

```bash
# Deploy dashboard
cd infra && ./phase4-deploy.sh

# Get dashboard URL
gcloud run services describe devpulse-dashboard --region=us-central1 --format 'value(status.url)'

# Update Slack bridge with dashboard URL
gcloud functions deploy slackEvents --gen2 --update-env-vars DASHBOARD_URL=$DASHBOARD_URL

# View dashboard logs
gcloud run services logs read devpulse-dashboard --region=us-central1 --limit=50

# Trigger test incident
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Open dashboard
open $(gcloud run services describe devpulse-dashboard --region=us-central1 --format 'value(status.url)')
```

---

**Phase 4 Status:** Ready to deploy
**Estimated Time:** 30-45 minutes
**Next Step:** Run `bash infra/phase4-deploy.sh`
