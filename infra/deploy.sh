#!/bin/bash
# infra/deploy.sh — Deploy all DevPulse services to Google Cloud Run
# Usage: ./infra/deploy.sh [PROJECT_ID] [REGION]

set -euo pipefail

PROJECT="${1:-$(gcloud config get-value project)}"
REGION="${2:-us-central1}"

echo "▶ Deploying DevPulse to project: $PROJECT, region: $REGION"
echo ""

# ─── Dashboard ────────────────────────────────────────────────────
echo "1/4  Deploying dashboard..."
gcloud run deploy devpulse-dashboard \
  --source ./apps/dashboard \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars \
    NEXT_PUBLIC_FIREBASE_API_KEY="${NEXT_PUBLIC_FIREBASE_API_KEY}", \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}", \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID}", \
    NEXT_PUBLIC_FIREBASE_APP_ID="${NEXT_PUBLIC_FIREBASE_APP_ID}"

DASHBOARD_URL=$(gcloud run services describe devpulse-dashboard \
  --platform managed --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ Dashboard: $DASHBOARD_URL"
echo ""

# ─── Demo API ─────────────────────────────────────────────────────
echo "2/4  Deploying demo-api..."
gcloud run deploy devpulse-demo-api \
  --source ./apps/demo-api \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --min-instances 1

DEMO_URL=$(gcloud run services describe devpulse-demo-api \
  --platform managed --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ Demo API: $DEMO_URL"
echo ""

# ─── Webhook Receiver ────────────────────────────────────────────
echo "3/4  Deploying webhook-receiver..."
gcloud functions deploy devpulse-webhook \
  --gen2 \
  --runtime nodejs20 \
  --region "$REGION" \
  --project "$PROJECT" \
  --source ./apps/webhook-receiver \
  --entry-point webhookReceiver \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars \
    AGENT_BUILDER_PROJECT="${AGENT_BUILDER_PROJECT}", \
    AGENT_BUILDER_LOCATION="${AGENT_BUILDER_LOCATION}", \
    AGENT_BUILDER_AGENT_ID="${AGENT_BUILDER_AGENT_ID}"

WEBHOOK_URL=$(gcloud functions describe devpulse-webhook \
  --gen2 --region "$REGION" --project "$PROJECT" \
  --format "value(serviceConfig.uri)")
echo "   ✓ Webhook Receiver: $WEBHOOK_URL"
echo ""

# ─── Slack Bridge ────────────────────────────────────────────────
echo "4/4  Deploying slack-bridge..."
gcloud functions deploy devpulse-slack \
  --gen2 \
  --runtime nodejs20 \
  --region "$REGION" \
  --project "$PROJECT" \
  --source ./apps/slack-bridge \
  --entry-point slackBridge \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars \
    SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN}", \
    SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET}", \
    SLACK_CHANNEL_ID="${SLACK_CHANNEL_ID}"

SLACK_URL=$(gcloud functions describe devpulse-slack \
  --gen2 --region "$REGION" --project "$PROJECT" \
  --format "value(serviceConfig.uri)")
echo "   ✓ Slack Bridge: $SLACK_URL"
echo ""

# ─── Summary ─────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "✅  DevPulse deployed"
echo ""
echo "  Dashboard:        $DASHBOARD_URL"
echo "  Demo API:         $DEMO_URL"
echo "  Webhook Receiver: $WEBHOOK_URL"
echo "  Slack Bridge:     $SLACK_URL"
echo ""
echo "Next steps:"
echo "  1. Paste $WEBHOOK_URL into Dynatrace problem webhook config"
echo "  2. Paste $SLACK_URL/slack/events into Slack app Interactivity URL"
echo "  3. Update NEXT_PUBLIC_DASHBOARD_URL in slack-bridge to: $DASHBOARD_URL"
echo "════════════════════════════════════════"
