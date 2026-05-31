#!/bin/bash
# Phase 1 Deployment Script
# Deploys demo-api to Cloud Run with Dynatrace OneAgent

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  DevPulse Phase 1 Deployment${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Check if required tools are installed
command -v gcloud >/dev/null 2>&1 || { echo -e "${RED}ERROR: gcloud CLI is not installed${NC}" >&2; exit 1; }

# Load environment variables
if [ -f ../.env ]; then
    echo -e "${YELLOW}Loading environment from .env${NC}"
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

# Validate required variables
if [ -z "$GCP_PROJECT_ID" ]; then
    echo -e "${RED}ERROR: GCP_PROJECT_ID not set in .env${NC}"
    exit 1
fi

if [ -z "$GCP_REGION" ]; then
    GCP_REGION="us-central1"
    echo -e "${YELLOW}Using default region: $GCP_REGION${NC}"
fi

# Set GCP project
echo -e "${YELLOW}Setting GCP project to: $GCP_PROJECT_ID${NC}"
gcloud config set project $GCP_PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}Enabling required GCP APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com \
    --quiet

# Build and deploy demo-api
echo -e "${GREEN}Building demo-api container...${NC}"
cd ../apps/demo-api

# Submit build to Cloud Build
gcloud builds submit \
    --tag gcr.io/$GCP_PROJECT_ID/devpulse-demo-api \
    --quiet

# Deploy to Cloud Run
echo -e "${GREEN}Deploying to Cloud Run...${NC}"

# Base deploy command
DEPLOY_CMD="gcloud run deploy devpulse-demo-api \
    --image gcr.io/$GCP_PROJECT_ID/devpulse-demo-api \
    --platform managed \
    --region $GCP_REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 300 \
    --quiet"

# Add Dynatrace environment variables if provided
if [ -n "$DYNATRACE_ENVIRONMENT_ID" ] && [ -n "$DYNATRACE_API_TOKEN" ]; then
    echo -e "${YELLOW}Configuring Dynatrace OneAgent...${NC}"
    DEPLOY_CMD="$DEPLOY_CMD \
        --set-env-vars DT_TENANT=$DYNATRACE_ENVIRONMENT_ID \
        --set-env-vars DT_API_TOKEN=$DYNATRACE_API_TOKEN \
        --set-env-vars DT_LOGLEVELCON=INFO"
else
    echo -e "${YELLOW}Dynatrace credentials not provided - skipping OneAgent setup${NC}"
fi

# Execute deployment
eval $DEPLOY_CMD

# Get the service URL
SERVICE_URL=$(gcloud run services describe devpulse-demo-api \
    --platform managed \
    --region $GCP_REGION \
    --format 'value(status.url)')

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Phase 1 Deployment Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "Demo API URL: ${GREEN}$SERVICE_URL${NC}"
echo ""
echo -e "${YELLOW}Test endpoints:${NC}"
echo "  Health check:  curl $SERVICE_URL/healthz"
echo "  Get todos:     curl $SERVICE_URL/todos"
echo "  Chaos control: curl -X POST $SERVICE_URL/chaos -H 'Content-Type: application/json' -d '{\"mode\":\"errors\"}'"
echo ""

# Save service URL to a file
cd ../../infra
echo "DEMO_API_URL=$SERVICE_URL" > phase1-outputs.env
echo -e "${YELLOW}Service URL saved to infra/phase1-outputs.env${NC}"

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Visit Dynatrace dashboard to verify OneAgent is reporting"
echo "  2. Trigger chaos mode: curl -X POST $SERVICE_URL/chaos -d '{\"mode\":\"errors\"}'"
echo "  3. Generate traffic: for i in {1..20}; do curl -X POST $SERVICE_URL/todos -d '{\"text\":\"test\"}'; done"
echo "  4. Check Dynatrace for problem alerts"
echo ""
