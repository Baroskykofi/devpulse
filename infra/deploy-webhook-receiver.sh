#!/bin/bash
# Deploy webhook-receiver Cloud Function
# This is a placeholder for Phase 2, but we'll deploy the endpoint now

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Deploying webhook-receiver Cloud Function...${NC}"

# Load environment variables
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo "ERROR: .env file not found"
    exit 1
fi

# Navigate to webhook-receiver
cd ../apps/webhook-receiver

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Deploy Cloud Function
echo -e "${YELLOW}Deploying to Cloud Functions...${NC}"
gcloud functions deploy webhookReceiver \
    --gen2 \
    --runtime nodejs20 \
    --region $GCP_REGION \
    --source . \
    --entry-point webhookReceiver \
    --trigger-http \
    --allow-unauthenticated \
    --memory 256MB \
    --timeout 60s \
    --set-env-vars FIRESTORE_PROJECT_ID=$GCP_PROJECT_ID \
    --quiet

# Get the function URL
FUNCTION_URL=$(gcloud functions describe webhookReceiver \
    --gen2 \
    --region $GCP_REGION \
    --format 'value(serviceConfig.uri)')

echo ""
echo -e "${GREEN}Webhook receiver deployed!${NC}"
echo -e "URL: ${GREEN}$FUNCTION_URL${NC}"
echo ""
echo -e "${YELLOW}Configure this URL in Dynatrace:${NC}"
echo "  Settings → Integrations → Problem notifications → Custom integration"
echo "  Webhook URL: $FUNCTION_URL"
echo ""

# Save to outputs
cd ../../infra
echo "WEBHOOK_RECEIVER_URL=$FUNCTION_URL" >> phase1-outputs.env
