#!/bin/bash
# Setup Cloud Build Trigger for DevPulse
# This script creates/updates a Cloud Build trigger to deploy all services

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

# Validate required variables
REQUIRED_VARS=(
    "GCP_PROJECT_ID"
    "GCP_REGION"
    "DYNATRACE_ENVIRONMENT_ID"
    "DYNATRACE_API_TOKEN"
    "DYNATRACE_API_KEY"
    "FIRESTORE_PROJECT_ID"
    "AGENT_BUILDER_AGENT_ID"
    "NEXT_PUBLIC_FIREBASE_API_KEY"
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
    "NEXT_PUBLIC_FIREBASE_APP_ID"
)

echo -e "${YELLOW}Validating environment variables...${NC}"
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}Error: $var is not set in .env${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required variables are set${NC}"

# Set project
echo -e "${YELLOW}Setting GCP project to ${GCP_PROJECT_ID}...${NC}"
gcloud config set project ${GCP_PROJECT_ID}

# Check if trigger already exists
TRIGGER_NAME="devpulse-deploy-all"
echo -e "${YELLOW}Checking for existing trigger...${NC}"
if gcloud builds triggers describe ${TRIGGER_NAME} --region=${GCP_REGION} &>/dev/null; then
    echo -e "${YELLOW}Trigger '${TRIGGER_NAME}' already exists. Deleting...${NC}"
    gcloud builds triggers delete ${TRIGGER_NAME} --region=${GCP_REGION} --quiet
fi

# Create new trigger
echo -e "${YELLOW}Creating Cloud Build trigger...${NC}"
gcloud builds triggers create github \
    --name="${TRIGGER_NAME}" \
    --region="${GCP_REGION}" \
    --repo-name="devpulse" \
    --repo-owner="Baroskykofi" \
    --branch-pattern="^main$" \
    --build-config="cloudbuild.yaml" \
    --substitutions="_REGION=${GCP_REGION},_DYNATRACE_ENVIRONMENT_ID=${DYNATRACE_ENVIRONMENT_ID},_DYNATRACE_API_TOKEN=${DYNATRACE_API_TOKEN},_DYNATRACE_API_KEY=${DYNATRACE_API_KEY},_FIRESTORE_PROJECT_ID=${FIRESTORE_PROJECT_ID},_AGENT_BUILDER_AGENT_ID=${AGENT_BUILDER_AGENT_ID},_NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY},_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN},_NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID},_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET},_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID},_NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}"

echo -e "${GREEN}✓ Cloud Build trigger created successfully${NC}"

# Run the trigger
echo -e "${YELLOW}Do you want to run the build now? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${YELLOW}Triggering build...${NC}"
    gcloud builds triggers run ${TRIGGER_NAME} --region=${GCP_REGION} --branch=main
    echo -e "${GREEN}✓ Build started${NC}"
    echo -e "${YELLOW}Monitor progress at: https://console.cloud.google.com/cloud-build/builds?project=${GCP_PROJECT_ID}${NC}"
else
    echo -e "${YELLOW}Skipping build. You can manually trigger it from the console or by pushing to main branch.${NC}"
fi

echo -e "${GREEN}✓ Setup complete!${NC}"
