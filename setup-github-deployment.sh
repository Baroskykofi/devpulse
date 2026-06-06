#!/bin/bash
# Setup script for GitHub Actions deployment
# This creates the service account and outputs the secrets you need to add to GitHub

set -e

echo "🚀 Setting up GitHub Actions deployment for DevPulse"
echo ""

# Load environment
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  exit 1
fi

source .env

# Check required variables
if [ -z "$GCP_PROJECT_ID" ]; then
  echo "❌ GCP_PROJECT_ID not set in .env"
  exit 1
fi

echo "📦 Project: $GCP_PROJECT_ID"
echo ""

# Step 1: Enable APIs
echo "1️⃣  Enabling required Google Cloud APIs..."
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudfunctions.googleapis.com \
  containerregistry.googleapis.com \
  --project=$GCP_PROJECT_ID

echo "✅ APIs enabled"
echo ""

# Step 2: Create service account
echo "2️⃣  Creating service account..."
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Check if service account exists
if gcloud iam service-accounts describe $SA_EMAIL --project=$GCP_PROJECT_ID &>/dev/null; then
  echo "⚠️  Service account already exists, skipping creation"
else
  gcloud iam service-accounts create $SA_NAME \
    --display-name="GitHub Actions Deployer" \
    --project=$GCP_PROJECT_ID
  echo "✅ Service account created: $SA_EMAIL"
fi
echo ""

# Step 3: Grant IAM roles
echo "3️⃣  Granting IAM permissions..."
ROLES=(
  "roles/run.admin"
  "roles/cloudfunctions.admin"
  "roles/cloudbuild.builds.editor"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
)

for ROLE in "${ROLES[@]}"; do
  echo "   Granting $ROLE..."
  gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --quiet
done

echo "✅ Permissions granted"
echo ""

# Step 4: Create service account key
echo "4️⃣  Creating service account key..."
KEY_FILE="github-actions-key.json"

if [ -f "$KEY_FILE" ]; then
  echo "⚠️  Key file already exists: $KEY_FILE"
  read -p "   Overwrite? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   Using existing key file"
  else
    rm $KEY_FILE
    gcloud iam service-accounts keys create $KEY_FILE \
      --iam-account=$SA_EMAIL \
      --project=$GCP_PROJECT_ID
    echo "✅ New key created: $KEY_FILE"
  fi
else
  gcloud iam service-accounts keys create $KEY_FILE \
    --iam-account=$SA_EMAIL \
    --project=$GCP_PROJECT_ID
  echo "✅ Key created: $KEY_FILE"
fi
echo ""

# Step 5: Output GitHub secrets
echo "════════════════════════════════════════════════════════════════"
echo "✅ Setup complete! Now configure GitHub secrets:"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Go to: https://github.com/Baroskykofi/devpulse/settings/secrets/actions"
echo ""
echo "Add these secrets (click 'New repository secret' for each):"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: GCP_SA_KEY"
echo "Value: (paste entire contents of github-actions-key.json)"
echo ""
echo "To copy to clipboard (if you have xclip/pbcopy):"
echo "  cat github-actions-key.json | pbcopy    # macOS"
echo "  cat github-actions-key.json | xclip     # Linux"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: GCP_PROJECT_ID"
echo "Value: $GCP_PROJECT_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: DYNATRACE_ENVIRONMENT_ID"
echo "Value: $DYNATRACE_ENVIRONMENT_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: DYNATRACE_API_TOKEN"
echo "Value: $DYNATRACE_API_TOKEN"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: DYNATRACE_API_KEY"
echo "Value: $DYNATRACE_API_KEY"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: FIRESTORE_PROJECT_ID"
echo "Value: $FIRESTORE_PROJECT_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: AGENT_BUILDER_AGENT_ID"
echo "Value: $AGENT_BUILDER_AGENT_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: NEXT_PUBLIC_FIREBASE_API_KEY"
echo "Value: $NEXT_PUBLIC_FIREBASE_API_KEY"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo "Value: $NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo "Value: $NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
echo "Value: $NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
echo "Value: $NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "Secret Name: NEXT_PUBLIC_FIREBASE_APP_ID"
echo "Value: $NEXT_PUBLIC_FIREBASE_APP_ID"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "After adding all secrets, push to GitHub:"
echo ""
echo "  git add ."
echo "  git commit -m \"feat: Add GitHub Actions deployment\""
echo "  git push origin main"
echo ""
echo "Then watch deployments at:"
echo "  https://github.com/Baroskykofi/devpulse/actions"
echo ""
