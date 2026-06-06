#!/bin/bash
# DevPulse Phase 2 Master Deployment Script
# Orchestrates the complete Agent Brain setup

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
echo -e "${BLUE}║          ${BOLD}DevPulse Phase 2: Agent Brain Setup${NC}${BLUE}             ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║  Deploying Firebase, Webhook Receiver, and Agent Builder    ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if .env exists
if [ ! -f ../.env ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    echo ""
    echo "Create .env from template:"
    echo "  cp .env.phase1.example .env"
    echo "  # Add your Phase 2 configuration"
    echo ""
    exit 1
fi

# Load environment
export $(cat ../.env | grep -v '^#' | xargs)

# Verify required variables
REQUIRED_VARS=(
    "GCP_PROJECT_ID"
    "GCP_REGION"
    "DYNATRACE_ENVIRONMENT_ID"
    "DYNATRACE_API_KEY"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}✗ Missing required variable: $var${NC}"
        echo "  Add it to your .env file"
        exit 1
    fi
done

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Check if Phase 1 is complete
echo -e "${YELLOW}Verifying Phase 1 deployment...${NC}"
if ! gcloud run services describe devpulse-demo-api --region=$GCP_REGION --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${RED}✗ Demo API not found${NC}"
    echo ""
    echo "Phase 1 must be completed first:"
    echo "  bash infra/phase1-deploy.sh"
    echo ""
    exit 1
fi
echo -e "${GREEN}✓ Phase 1 complete${NC}"
echo ""

# Create phase2-outputs.env if it doesn't exist
touch phase2-outputs.env

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Firebase & Firestore Setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 1/4: Firebase & Firestore${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if gcloud firestore databases describe --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${GREEN}✓ Firestore already set up${NC}"
else
    echo -e "${YELLOW}Setting up Firebase...${NC}"
    bash setup-firebase.sh
fi
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Deploy Webhook Receiver
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 2/4: Webhook Receiver${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if gcloud functions describe webhookReceiver --gen2 --region=$GCP_REGION --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${GREEN}✓ Webhook receiver already deployed${NC}"
    WEBHOOK_URL=$(gcloud functions describe webhookReceiver \
        --gen2 \
        --region=$GCP_REGION \
        --project=$GCP_PROJECT_ID \
        --format 'value(serviceConfig.uri)')
    echo -e "  URL: ${GREEN}$WEBHOOK_URL${NC}"
else
    echo -e "${YELLOW}Deploying webhook receiver...${NC}"
    bash deploy-webhook-receiver.sh
    WEBHOOK_URL=$(cat phase2-outputs.env | grep WEBHOOK_RECEIVER_URL | cut -d'=' -f2)
fi
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Agent Builder Setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 3/4: Agent Builder Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

bash setup-agent-builder.sh
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Dynatrace Webhook Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 4/4: Dynatrace Webhook${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Manual Configuration Required:${NC}"
echo ""
echo "Configure Dynatrace to send problem alerts to the webhook:"
echo ""
echo "  1. Open Dynatrace: ${GREEN}https://$DYNATRACE_ENVIRONMENT_ID${NC}"
echo ""
echo "  2. Navigate to:"
echo "     ${YELLOW}Settings → Integrations → Problem notifications${NC}"
echo ""
echo "  3. Click ${YELLOW}Add notification${NC}"
echo ""
echo "  4. Choose: ${YELLOW}Custom integration${NC}"
echo ""
echo "  5. Configuration:"
echo "     - Name: ${GREEN}DevPulse Webhook${NC}"
echo "     - Webhook URL: ${GREEN}$WEBHOOK_URL${NC}"
echo ""
echo "     - Payload:"
cat << 'EOF'
       {
         "problemId": "{ProblemID}",
         "problemTitle": "{ProblemTitle}",
         "state": "{State}",
         "severityLevel": "{ProblemSeverity}",
         "impactedEntityNames": {ImpactedEntityNames}
       }
EOF
echo ""
echo "     - HTTP Headers:"
echo "       ${YELLOW}Content-Type: application/json${NC}"
echo ""
echo "     - Alerting profile: ${GREEN}DevPulse Incidents${NC}"
echo ""
echo "  6. Click ${YELLOW}Save${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║                 ${GREEN}${BOLD}Phase 2 Deployment Complete!${NC}${BLUE}                ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Resources deployed:${NC}"
echo "  ✓ Firebase project: $GCP_PROJECT_ID"
echo "  ✓ Firestore database: $GCP_REGION"
echo "  ✓ Webhook receiver: $WEBHOOK_URL"
echo "  ✓ Agent Builder APIs: Enabled"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "  ${BOLD}1. Complete Agent Builder setup${NC}"
echo "     Follow the instructions from setup-agent-builder.sh"
echo "     Add AGENT_BUILDER_AGENT_ID to .env"
echo ""
echo "  ${BOLD}2. Test the webhook${NC}"
echo "     ${GREEN}curl -X POST $WEBHOOK_URL \\${NC}"
echo "     ${GREEN}  -H \"Content-Type: application/json\" \\${NC}"
echo "     ${GREEN}  -d '{\"problemId\":\"TEST-001\",\"state\":\"OPEN\",\"severityLevel\":\"ERROR\",\"problemTitle\":\"Test incident\"}'${NC}"
echo ""
echo "  ${BOLD}3. Trigger a real incident${NC}"
echo "     ${GREEN}export API_URL=\$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)${NC}"
echo "     ${GREEN}curl -X POST \$API_URL/chaos -d '{\"mode\":\"errors\"}'${NC}"
echo "     ${GREEN}# Generate traffic...${NC}"
echo ""
echo "  ${BOLD}4. Monitor in Firestore${NC}"
echo "     https://console.firebase.google.com/project/$GCP_PROJECT_ID/firestore"
echo ""
echo "  ${BOLD}5. View logs${NC}"
echo "     ${GREEN}gcloud functions logs read webhookReceiver --region=$GCP_REGION --limit=50${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Phase 2 documentation: ${GREEN}docs/PHASE2_SETUP.md${NC}"
echo -e "Next phase: ${YELLOW}Phase 3 - Reasoning Loop${NC}"
echo ""
