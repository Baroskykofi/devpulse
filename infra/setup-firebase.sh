#!/bin/bash
# Firebase and Firestore Setup Script for Phase 2
# This script automates the Firebase initialization process

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  DevPulse Phase 2: Firebase Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Load environment variables
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}Firebase CLI not found. Installing...${NC}"
    npm install -g firebase-tools
    echo -e "${GREEN}✓ Firebase CLI installed${NC}"
else
    echo -e "${GREEN}✓ Firebase CLI already installed${NC}"
fi

# Check Firebase login status
echo -e "${YELLOW}Checking Firebase login status...${NC}"
if firebase projects:list &> /dev/null; then
    echo -e "${GREEN}✓ Already logged in to Firebase${NC}"
else
    echo -e "${YELLOW}Please login to Firebase...${NC}"
    firebase login
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if Firebase is already initialized
if [ -f "firebase.json" ]; then
    echo -e "${GREEN}✓ Firebase already initialized${NC}"
else
    echo -e "${YELLOW}Initializing Firebase...${NC}"

    # Create firebase.json manually to avoid interactive prompts
    cat > firebase.json << 'EOF'
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "apps/webhook-receiver",
      "codebase": "webhook-receiver",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log"
      ],
      "predeploy": [
        "npm --prefix \"$RESOURCE_DIR\" run lint"
      ]
    }
  ]
}
EOF

    # Create firestore indexes file
    cat > firestore.indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "incidents",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "startedAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "incidents",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "severity",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "startedAt",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

    echo -e "${GREEN}✓ Firebase configuration created${NC}"
fi

# Set the Firebase project
echo -e "${YELLOW}Setting Firebase project to: $GCP_PROJECT_ID${NC}"
firebase use --add $GCP_PROJECT_ID

# Enable Firestore in GCP (if not already enabled)
echo -e "${YELLOW}Enabling Firestore API...${NC}"
gcloud services enable firestore.googleapis.com --project=$GCP_PROJECT_ID
echo -e "${GREEN}✓ Firestore API enabled${NC}"

# Create Firestore database if it doesn't exist
echo -e "${YELLOW}Checking Firestore database...${NC}"
if gcloud firestore databases describe --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${GREEN}✓ Firestore database already exists${NC}"
else
    echo -e "${YELLOW}Creating Firestore database...${NC}"
    gcloud firestore databases create \
        --location=$GCP_REGION \
        --type=firestore-native \
        --project=$GCP_PROJECT_ID
    echo -e "${GREEN}✓ Firestore database created${NC}"
fi

# Deploy Firestore security rules
echo -e "${YELLOW}Deploying Firestore security rules...${NC}"
firebase deploy --only firestore:rules --project=$GCP_PROJECT_ID
echo -e "${GREEN}✓ Security rules deployed${NC}"

# Deploy Firestore indexes
echo -e "${YELLOW}Deploying Firestore indexes...${NC}"
firebase deploy --only firestore:indexes --project=$GCP_PROJECT_ID
echo -e "${GREEN}✓ Indexes deployed${NC}"

# Create service account for the agent (if doesn't exist)
SERVICE_ACCOUNT_NAME="devpulse-agent"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

echo -e "${YELLOW}Checking service account...${NC}"
if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL --project=$GCP_PROJECT_ID &> /dev/null; then
    echo -e "${GREEN}✓ Service account already exists${NC}"
else
    echo -e "${YELLOW}Creating service account...${NC}"
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="DevPulse Agent" \
        --description="Service account for DevPulse agent operations" \
        --project=$GCP_PROJECT_ID
    echo -e "${GREEN}✓ Service account created${NC}"
fi

# Grant necessary permissions
echo -e "${YELLOW}Granting service account permissions...${NC}"
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/datastore.user" \
    --condition=None

gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudfunctions.invoker" \
    --condition=None

echo -e "${GREEN}✓ Permissions granted${NC}"

# Update .env with Firebase configuration
echo ""
echo -e "${YELLOW}Updating .env file...${NC}"
if ! grep -q "FIREBASE_PROJECT_ID" .env; then
    echo "" >> .env
    echo "# ── Firebase (Phase 2) ──────────────────────────────────────────────" >> .env
    echo "FIREBASE_PROJECT_ID=$GCP_PROJECT_ID" >> .env
    echo "FIRESTORE_PROJECT_ID=$GCP_PROJECT_ID" >> .env
fi
echo -e "${GREEN}✓ .env updated${NC}"

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Firebase Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}Resources created:${NC}"
echo "  • Firebase project: $GCP_PROJECT_ID"
echo "  • Firestore database: $GCP_REGION"
echo "  • Service account: $SERVICE_ACCOUNT_EMAIL"
echo "  • Security rules: Deployed"
echo "  • Indexes: Deployed"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Deploy webhook receiver:"
echo "     ${BLUE}bash infra/deploy-webhook-receiver.sh${NC}"
echo ""
echo "  2. Set up Google Cloud Agent Builder (see docs/PHASE2_SETUP.md)"
echo ""
echo -e "${YELLOW}Verify Firestore:${NC}"
echo "  https://console.firebase.google.com/project/$GCP_PROJECT_ID/firestore"
echo ""
