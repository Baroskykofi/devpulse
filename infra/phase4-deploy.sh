#!/bin/bash
# DevPulse Phase 4 Master Deployment Script
# Deploys the dashboard and enhances the human interface

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║         ${BOLD}DevPulse Phase 4: Human Interface Setup${NC}${BLUE}          ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║      Deploying Dashboard and Slack Integration Polish       ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Load environment
if [ ! -f ../.env ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    exit 1
fi

export $(cat ../.env | grep -v '^#' | xargs)

# Check Phase 3 is complete
echo -e "${YELLOW}Verifying Phase 3 deployment...${NC}"
if ! gcloud functions describe runReasoningLoop --gen2 --region=$GCP_REGION --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${RED}✗ Orchestrator not found${NC}"
    echo "  Run Phase 3 first: bash infra/phase3-deploy.sh"
    exit 1
fi
echo -e "${GREEN}✓ Phase 3 complete${NC}"
echo ""

# Create phase4-outputs.env if it doesn't exist
touch phase4-outputs.env

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Deploy Dashboard to Cloud Run
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 1/2: Dashboard Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd ../apps/dashboard

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}Creating .env.local from template...${NC}"
    cat > .env.local << EOF
NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
EOF
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Build
echo -e "${YELLOW}Building production bundle...${NC}"
npm run build

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy devpulse-dashboard \
    --source . \
    --platform managed \
    --region $GCP_REGION \
    --allow-unauthenticated \
    --memory 512Mi \
    --min-instances 0 \
    --max-instances 5 \
    --set-env-vars NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    --set-env-vars NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    --set-env-vars NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    --set-env-vars NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# Get dashboard URL
DASHBOARD_URL=$(gcloud run services describe devpulse-dashboard \
    --region=$GCP_REGION \
    --format 'value(status.url)')

cd ../../infra
echo "DASHBOARD_URL=$DASHBOARD_URL" >> phase4-outputs.env

echo -e "${GREEN}✓ Dashboard deployed: $DASHBOARD_URL${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Update Slack Bridge with Dashboard URL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 2/2: Update Slack Integration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -n "$SLACK_BOT_TOKEN" ] && [ "$SLACK_BOT_TOKEN" != "xoxb-your-token" ]; then
    echo -e "${YELLOW}Updating Slack bridge with dashboard URL...${NC}"

    cd ../apps/slack-bridge

    gcloud functions deploy slackEvents \
        --gen2 \
        --runtime nodejs20 \
        --region $GCP_REGION \
        --source . \
        --entry-point slackEvents \
        --trigger-http \
        --allow-unauthenticated \
        --update-env-vars DASHBOARD_URL=$DASHBOARD_URL

    echo -e "${GREEN}✓ Slack bridge updated${NC}"
else
    echo -e "${YELLOW}Slack integration not configured (no SLACK_BOT_TOKEN)${NC}"
    echo -e "${YELLOW}Dashboard-only mode enabled${NC}"
fi

cd ../../infra
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║                 ${GREEN}${BOLD}Phase 4 Deployment Complete!${NC}${BLUE}                ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Resources deployed:${NC}"
echo "  ✓ Dashboard: $DASHBOARD_URL"
if [ -n "$SLACK_URL" ]; then
    echo "  ✓ Slack integration: Updated with dashboard link"
fi
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  ${BOLD}1. Open the dashboard${NC}"
echo "     ${GREEN}$DASHBOARD_URL${NC}"
echo ""
echo "  ${BOLD}2. Test the full flow${NC}"
echo "     a) Trigger incident via chaos mode"
echo "     b) Watch live reasoning timeline"
echo "     c) Approve/reject via dashboard or Slack"
echo ""
echo "  ${BOLD}3. Test on mobile${NC}"
echo "     - Open dashboard URL on phone"
echo "     - Check Slack notifications"
echo "     - Test approval buttons"
echo ""
echo "  ${BOLD}4. Run demo scenarios${NC}"
echo "     - Click \"Replay Scenario\" button"
echo "     - Test all 4 scenarios (A, B, C, D)"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Phase 4 documentation: ${GREEN}docs/PHASE4_SETUP.md${NC}"
echo -e "Next: ${YELLOW}Polish & Testing${NC}"
echo ""
echo -e "${GREEN}🎉 DevPulse is now fully deployed!${NC}"
echo ""
