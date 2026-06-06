#!/bin/bash
# infra/deploy-dynatrace-tools.sh
# Deploys Dynatrace tools as Cloud Functions for Agent Builder

set -euo pipefail

echo "🚀 Deploying Dynatrace Tools..."

# ── Load environment ──────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  exit 1
fi

source .env

# ── Verify required vars ──────────────────────────────────────────────
: "${GCP_PROJECT_ID:?Error: GCP_PROJECT_ID not set}"
: "${DYNATRACE_ENVIRONMENT_ID:?Error: DYNATRACE_ENVIRONMENT_ID not set}"
: "${DYNATRACE_API_KEY:?Error: DYNATRACE_API_KEY not set}"

REGION="${GCP_REGION:-us-central1}"

# ── Enable APIs ───────────────────────────────────────────────────────
echo "📦 Enabling APIs..."
gcloud services enable cloudfunctions.googleapis.com --project="$GCP_PROJECT_ID"
gcloud services enable cloudbuild.googleapis.com --project="$GCP_PROJECT_ID"

cd apps/dynatrace-tools

# ── Deploy each tool ──────────────────────────────────────────────────
TOOLS=(
  "get_problem_details"
  "get_affected_entities"
  "query_metrics"
  "fetch_logs"
  "write_reasoning_step"
)

echo ""
echo "🔧 Deploying ${#TOOLS[@]} tools..."
echo ""

for TOOL in "${TOOLS[@]}"; do
  echo "   Deploying $TOOL..."

  gcloud functions deploy "$TOOL" \
    --gen2 \
    --runtime=nodejs20 \
    --region="$REGION" \
    --source=. \
    --entry-point="$TOOL" \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="DYNATRACE_ENVIRONMENT_ID=$DYNATRACE_ENVIRONMENT_ID,DYNATRACE_API_KEY=$DYNATRACE_API_KEY,FIRESTORE_PROJECT_ID=${FIRESTORE_PROJECT_ID:-$GCP_PROJECT_ID}" \
    --project="$GCP_PROJECT_ID" \
    --quiet
done

# ── Get URLs ──────────────────────────────────────────────────────────
echo ""
echo "✅ All tools deployed successfully!"
echo ""
echo "📋 Tool URLs:"
echo ""

for TOOL in "${TOOLS[@]}"; do
  URL=$(gcloud functions describe "$TOOL" \
    --gen2 \
    --region="$REGION" \
    --project="$GCP_PROJECT_ID" \
    --format='value(serviceConfig.uri)')

  echo "   $TOOL: $URL"
done

cd ../..

echo ""
echo "🔗 Next: Configure these URLs in Agent Builder as HTTP tools"
