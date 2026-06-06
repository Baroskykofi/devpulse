#!/bin/bash
# Docker-based deployment script for DevPulse
# Builds and deploys all services to Google Cloud Run using Docker

set -e

echo "🐳 DevPulse Docker Deployment"
echo "=============================="
echo ""

# Load environment
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  exit 1
fi

source .env

# Validate required variables
: "${GCP_PROJECT_ID:?Error: GCP_PROJECT_ID not set in .env}"
: "${GCP_REGION:=us-central1}"

echo "📦 Project: $GCP_PROJECT_ID"
echo "🌍 Region: $GCP_REGION"
echo ""

# Configure Docker to use GCR
echo "🔐 Configuring Docker for Google Container Registry..."
gcloud auth configure-docker

# Function to build and deploy a service
deploy_service() {
  local SERVICE_NAME=$1
  local CONTEXT_PATH=$2
  local PORT=$3
  local ENV_VARS=$4

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚀 Deploying: $SERVICE_NAME"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Build image
  echo "🔨 Building Docker image..."
  docker build -t gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:latest $CONTEXT_PATH

  # Push to GCR
  echo "📤 Pushing to Google Container Registry..."
  docker push gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:latest

  # Deploy to Cloud Run
  echo "☁️  Deploying to Cloud Run..."
  gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:latest \
    --platform managed \
    --region $GCP_REGION \
    --allow-unauthenticated \
    --port $PORT \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    $ENV_VARS \
    --quiet

  # Get service URL
  SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --platform managed \
    --region $GCP_REGION \
    --format 'value(status.url)')

  echo "✅ Deployed: $SERVICE_URL"
}

# Deploy Demo API
deploy_service \
  "devpulse-demo-api" \
  "./apps/demo-api" \
  "8080" \
  "--set-env-vars DT_TENANT=$DYNATRACE_ENVIRONMENT_ID --set-env-vars DT_API_TOKEN=$DYNATRACE_API_TOKEN"

# Deploy Webhook Receiver
deploy_service \
  "devpulse-webhook-receiver" \
  "./apps/webhook-receiver" \
  "8080" \
  "--set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID --set-env-vars AGENT_BUILDER_PROJECT=$GCP_PROJECT_ID --set-env-vars AGENT_BUILDER_LOCATION=$GCP_REGION --set-env-vars AGENT_BUILDER_AGENT_ID=$AGENT_BUILDER_AGENT_ID"

# Deploy Dynatrace Tools
deploy_service \
  "devpulse-dynatrace-tools" \
  "./apps/dynatrace-tools" \
  "8080" \
  "--set-env-vars DYNATRACE_ENVIRONMENT_ID=$DYNATRACE_ENVIRONMENT_ID --set-env-vars DYNATRACE_API_KEY=$DYNATRACE_API_KEY --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID"

# Deploy Dashboard
deploy_service \
  "devpulse-dashboard" \
  "./apps/dashboard" \
  "3000" \
  ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All services deployed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Service URLs:"
echo ""

for SERVICE in devpulse-demo-api devpulse-webhook-receiver devpulse-dynatrace-tools devpulse-dashboard; do
  URL=$(gcloud run services describe $SERVICE \
    --platform managed \
    --region $GCP_REGION \
    --format 'value(status.url)' 2>/dev/null || echo "Not deployed")
  echo "   $SERVICE: $URL"
done

echo ""
echo "🎯 Next steps:"
echo "   1. Test demo API: curl \$DEMO_API_URL/healthz"
echo "   2. Open dashboard: Visit dashboard URL in browser"
echo "   3. Configure Dynatrace webhook with webhook-receiver URL"
echo ""
