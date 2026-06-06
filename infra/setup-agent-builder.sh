#!/bin/bash
# Google Cloud Agent Builder Setup Script
# Creates and configures the Gemini-powered reasoning agent

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  DevPulse Phase 2: Agent Builder Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Load environment variables
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

# Enable required APIs
echo -e "${YELLOW}Enabling Agent Builder APIs...${NC}"
gcloud services enable \
    aiplatform.googleapis.com \
    dialogflow.googleapis.com \
    --project=$GCP_PROJECT_ID

echo -e "${GREEN}✓ APIs enabled${NC}"

# Check if agent already exists
echo -e "${YELLOW}Checking for existing agent...${NC}"

if [ -n "$AGENT_BUILDER_AGENT_ID" ] && [ "$AGENT_BUILDER_AGENT_ID" != "your-agent-id" ]; then
    echo -e "${GREEN}✓ Agent ID found in .env: $AGENT_BUILDER_AGENT_ID${NC}"
    echo ""
    echo -e "${YELLOW}To update the agent, visit:${NC}"
    echo "  https://console.cloud.google.com/gen-app-builder/engines"
    echo ""
    exit 0
fi

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Manual Agent Builder Setup Required${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Google Cloud Agent Builder must be configured manually via the console."
echo ""
echo -e "${BLUE}Step 1: Create Agent${NC}"
echo "  1. Open: ${GREEN}https://console.cloud.google.com/gen-app-builder/engines${NC}"
echo "  2. Select project: ${GREEN}$GCP_PROJECT_ID${NC}"
echo "  3. Click ${YELLOW}Create App${NC}"
echo "  4. Choose: ${YELLOW}Agent${NC}"
echo "  5. Configuration:"
echo "     - Agent name: ${GREEN}devpulse-incident-agent${NC}"
echo "     - Region: ${GREEN}$GCP_REGION${NC}"
echo "     - Model: ${GREEN}Gemini 1.5 Pro${NC} (or latest available)"
echo ""
echo -e "${BLUE}Step 2: Configure System Prompt${NC}"
echo "  1. In the agent settings, find ${YELLOW}Agent Instructions${NC}"
echo "  2. Copy the content from: ${GREEN}agent/system-prompt.md${NC}"
echo "  3. Paste into the instructions field"
echo ""
echo -e "${BLUE}Step 3: Add Tools${NC}"
echo "  The agent needs access to the following tools:"
echo ""
echo -e "  ${YELLOW}Dynatrace Tools (via HTTP):${NC}"
echo "    • get_problem_details"
echo "    • get_affected_entities"
echo "    • query_metrics"
echo "    • fetch_logs"
echo ""
echo "  Configuration for each tool is in: ${GREEN}agent/tools.json${NC}"
echo ""
echo "  For HTTP tools, use these endpoints:"
echo "    - Base URL: https://\${DYNATRACE_ENVIRONMENT_ID}/api/v2"
echo "    - Auth Header: Api-Token \${DYNATRACE_API_KEY}"
echo ""
echo -e "  ${YELLOW}GitHub Tools (via MCP - deploy separately):${NC}"
echo "    • list_recent_commits"
echo "    • get_commit_diff"
echo "    • revert_commit"
echo ""
echo -e "  ${YELLOW}Firestore Tool (built-in):${NC}"
echo "    • write_reasoning_step"
echo ""
echo -e "${BLUE}Step 4: Get Agent ID${NC}"
echo "  1. After creating the agent, note the Agent ID from the URL"
echo "  2. Format: ${GREEN}projects/{project}/locations/{location}/agents/{agent}${NC}"
echo "  3. Add it to your ${GREEN}.env${NC} file:"
echo ""
echo "     ${YELLOW}AGENT_BUILDER_AGENT_ID=projects/$GCP_PROJECT_ID/locations/$GCP_REGION/agents/YOUR_AGENT_ID${NC}"
echo ""
echo -e "${BLUE}Step 5: Test Agent${NC}"
echo "  1. In the Agent Builder console, use the ${YELLOW}Test${NC} panel"
echo "  2. Send a test message:"
echo ""
echo "     ${GREEN}{\"incidentId\": \"TEST-001\", \"problemId\": \"P-123\"}${NC}"
echo ""
echo "  3. Verify the agent responds with reasoning steps"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}After completing setup, run this script again to verify.${NC}"
echo ""
