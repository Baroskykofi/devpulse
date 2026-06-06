#!/bin/bash
# Deploy GitHub MCP Server as Cloud Run Service
# This MCP server provides GitHub integration tools for the agent

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Deploying GitHub MCP Server${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Load environment variables
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

# Verify GitHub token
if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "github_pat_XXXXXXXXXXXXXXXXXXXX" ]; then
    echo -e "${RED}ERROR: GITHUB_TOKEN not configured in .env${NC}"
    echo ""
    echo "Create a GitHub personal access token:"
    echo "  1. Go to: https://github.com/settings/tokens"
    echo "  2. Click 'Generate new token (classic)'"
    echo "  3. Scopes: repo, read:org"
    echo "  4. Copy token and add to .env:"
    echo "     GITHUB_TOKEN=github_pat_XXXXXXXXXXXX"
    echo ""
    exit 1
fi

# Navigate to GitHub MCP directory
cd ../tools/github-mcp

echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Create Dockerfile for GitHub MCP
echo -e "${YELLOW}Creating Dockerfile...${NC}"
cat > Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# The MCP server uses stdio transport, but for Cloud Run we need HTTP
# We'll use a simple HTTP wrapper
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "index.js"]
EOF

echo -e "${YELLOW}Building container...${NC}"
gcloud builds submit --tag gcr.io/$GCP_PROJECT_ID/github-mcp

echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy github-mcp \
    --image gcr.io/$GCP_PROJECT_ID/github-mcp \
    --platform managed \
    --region $GCP_REGION \
    --allow-unauthenticated \
    --memory 512Mi \
    --timeout 60s \
    --set-env-vars GITHUB_TOKEN=$GITHUB_TOKEN \
    --set-env-vars GITHUB_REPO_OWNER=$GITHUB_REPO_OWNER \
    --set-env-vars GITHUB_REPO_NAME=$GITHUB_REPO_NAME \
    --set-env-vars FIRESTORE_PROJECT_ID=$FIRESTORE_PROJECT_ID

# Get service URL
SERVICE_URL=$(gcloud run services describe github-mcp \
    --region $GCP_REGION \
    --format 'value(status.url)')

echo ""
echo -e "${GREEN}✓ GitHub MCP Server deployed!${NC}"
echo ""
echo -e "${GREEN}Service URL:${NC} $SERVICE_URL"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Register this MCP server in Agent Builder:"
echo "     - Go to your agent's Tools configuration"
echo "     - Add MCP server: $SERVICE_URL"
echo ""
echo "  2. The following tools are now available:"
echo "     • list_recent_commits"
echo "     • get_commit_diff"
echo "     • revert_commit"
echo ""

# Save to outputs
cd ../../infra
echo "GITHUB_MCP_URL=$SERVICE_URL" >> phase2-outputs.env

echo -e "${GREEN}URL saved to infra/phase2-outputs.env${NC}"
echo ""
