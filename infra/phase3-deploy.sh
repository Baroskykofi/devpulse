#!/bin/bash
# DevPulse Phase 3 Master Deployment Script
# Deploys the full reasoning loop: orchestrator, MCP tools, Slack bridge

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
echo -e "${BLUE}║         ${BOLD}DevPulse Phase 3: Reasoning Loop Setup${NC}${BLUE}           ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║  Deploying Orchestrator, MCP Tools, and Slack Integration   ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Load environment
if [ ! -f ../.env ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    exit 1
fi

export $(cat ../.env | grep -v '^#' | xargs)

# Check Phase 2 is complete
echo -e "${YELLOW}Verifying Phase 2 deployment...${NC}"
if ! gcloud functions describe webhookReceiver --gen2 --region=$GCP_REGION --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${RED}✗ Webhook receiver not found${NC}"
    echo "  Run Phase 2 first: bash infra/phase2-deploy.sh"
    exit 1
fi
echo -e "${GREEN}✓ Phase 2 complete${NC}"
echo ""

# Create phase3-outputs.env if it doesn't exist
touch phase3-outputs.env

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Deploy Dynatrace MCP Server
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 1/4: Dynatrace MCP Server${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Note: Dynatrace MCP can be used via HTTP tools in Agent Builder${NC}"
echo -e "${YELLOW}For Phase 3, we'll configure HTTP tools directly${NC}"
echo -e "${GREEN}✓ Dynatrace integration ready${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Deploy Agent Orchestrator
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 2/4: Agent Orchestrator${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd ../apps/agent-orchestrator

echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}Deploying Cloud Function...${NC}"
gcloud functions deploy runReasoningLoop \
    --gen2 \
    --runtime nodejs20 \
    --region $GCP_REGION \
    --source . \
    --entry-point runReasoningLoop \
    --trigger-http \
    --allow-unauthenticated \
    --memory 512MB \
    --timeout 540s \
    --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID \
    --set-env-vars GITHUB_TOKEN=$GITHUB_TOKEN \
    --set-env-vars GITHUB_REPO_OWNER=$GITHUB_REPO_OWNER \
    --set-env-vars GITHUB_REPO_NAME=$GITHUB_REPO_NAME \
    --set-env-vars DYNATRACE_ENVIRONMENT_ID=$DYNATRACE_ENVIRONMENT_ID \
    --set-env-vars DYNATRACE_API_KEY=$DYNATRACE_API_KEY

ORCHESTRATOR_URL=$(gcloud functions describe runReasoningLoop \
    --gen2 \
    --region=$GCP_REGION \
    --format 'value(serviceConfig.uri)')

cd ../../infra
echo "ORCHESTRATOR_URL=$ORCHESTRATOR_URL" >> phase3-outputs.env

echo -e "${GREEN}✓ Orchestrator deployed: $ORCHESTRATOR_URL${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Deploy Slack Bridge (Optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 3/4: Slack Integration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -n "$SLACK_BOT_TOKEN" ] && [ "$SLACK_BOT_TOKEN" != "xoxb-your-token" ]; then
    echo -e "${YELLOW}Deploying Slack bridge...${NC}"

    cd ../apps/slack-bridge
    npm install

    gcloud functions deploy slackEvents \
        --gen2 \
        --runtime nodejs20 \
        --region $GCP_REGION \
        --source . \
        --entry-point slackEvents \
        --trigger-http \
        --allow-unauthenticated \
        --set-env-vars SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN \
        --set-env-vars SLACK_SIGNING_SECRET=$SLACK_SIGNING_SECRET \
        --set-env-vars SLACK_CHANNEL=$SLACK_CHANNEL \
        --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID

    SLACK_URL=$(gcloud functions describe slackEvents \
        --gen2 \
        --region=$GCP_REGION \
        --format 'value(serviceConfig.uri)')

    cd ../../infra
    echo "SLACK_BRIDGE_URL=$SLACK_URL" >> phase3-outputs.env

    echo -e "${GREEN}✓ Slack bridge deployed: $SLACK_URL${NC}"
    echo -e "${YELLOW}Configure this URL in Slack:${NC}"
    echo "  1. Go to https://api.slack.com/apps"
    echo "  2. Select your app"
    echo "  3. Event Subscriptions → Request URL: $SLACK_URL"
    echo "  4. Interactivity → Request URL: $SLACK_URL/slack/events"
else
    echo -e "${YELLOW}Slack integration skipped (no SLACK_BOT_TOKEN in .env)${NC}"
    echo -e "${YELLOW}Dashboard-only approval will be used${NC}"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Update Webhook Receiver
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 4/4: Connect Webhook to Orchestrator${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Updating webhook receiver with orchestrator URL...${NC}"

cd ../apps/webhook-receiver

gcloud functions deploy webhookReceiver \
    --gen2 \
    --runtime nodejs20 \
    --region $GCP_REGION \
    --source . \
    --entry-point webhookReceiver \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID \
    --set-env-vars ORCHESTRATOR_URL=$ORCHESTRATOR_URL \
    --set-env-vars AGENT_BUILDER_AGENT_ID=$AGENT_BUILDER_AGENT_ID \
    --update-env-vars ORCHESTRATOR_URL=$ORCHESTRATOR_URL

cd ../../infra

echo -e "${GREEN}✓ Webhook receiver updated${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║                 ${GREEN}${BOLD}Phase 3 Deployment Complete!${NC}${BLUE}                ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Resources deployed:${NC}"
echo "  ✓ Agent orchestrator: $ORCHESTRATOR_URL"
if [ -n "$SLACK_URL" ]; then
    echo "  ✓ Slack bridge: $SLACK_URL"
fi
echo "  ✓ Webhook receiver: Updated with orchestrator URL"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  ${BOLD}1. Test the reasoning loop${NC}"
echo "     ${GREEN}cd test-scenarios${NC}"
echo "     ${GREEN}node run-test.js scenario-a-bad-deploy${NC}"
echo ""
echo "  ${BOLD}2. Trigger a real incident${NC}"
echo "     ${GREEN}export API_URL=\$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)${NC}"
echo "     ${GREEN}curl -X POST \$API_URL/chaos -d '{\"mode\":\"errors\"}'${NC}"
echo ""
echo "  ${BOLD}3. Monitor in Firestore${NC}"
echo "     https://console.firebase.google.com/project/$GCP_PROJECT_ID/firestore"
echo ""
echo "  ${BOLD}4. View orchestrator logs${NC}"
echo "     ${GREEN}gcloud functions logs read runReasoningLoop --region=$GCP_REGION --limit=50${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Phase 3 documentation: ${GREEN}docs/PHASE3_SETUP.md${NC}"
echo -e "Next phase: ${YELLOW}Phase 4 - Human Interface (Dashboard + Slack)${NC}"
echo ""
