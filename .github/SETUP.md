# GitHub Actions Setup Guide

This guide explains how to deploy DevPulse automatically through GitHub.

## Prerequisites

1. **GitHub Repository**
   - Create a new repository on GitHub
   - Push this codebase to the repository

2. **Google Cloud Service Account**
   - Create a service account with the following roles:
     - Cloud Run Admin
     - Cloud Functions Admin
     - Cloud Build Editor
     - Service Account User
     - Storage Admin

## Step 1: Create Google Cloud Service Account

```bash
# Set your project ID
export GCP_PROJECT_ID=devpaulse

# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer" \
  --project=$GCP_PROJECT_ID

# Grant necessary roles
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin"

gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:github-actions@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@$GCP_PROJECT_ID.iam.gserviceaccount.com
```

## Step 2: Configure GitHub Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Value | Where to Get It |
|------------|-------|-----------------|
| `GCP_SA_KEY` | Contents of `github-actions-key.json` | From Step 1 |
| `GCP_PROJECT_ID` | `devpaulse` | Your GCP project ID |
| `DYNATRACE_ENVIRONMENT_ID` | `hhv66215.live.dynatrace.com` | From .env |
| `DYNATRACE_API_TOKEN` | `dt0c01.26YV...` | From .env |
| `DYNATRACE_API_KEY` | `dt0c01.GUHD...` | From .env |
| `FIRESTORE_PROJECT_ID` | `devpulse-a3550` | From .env |
| `AGENT_BUILDER_AGENT_ID` | `ec726e22-6a27-4d3b-bea6-947a11380b09` | From .env |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyBUR2l9DG5y8Y4atejRr4UDNeYNmQ5ypic` | From .env |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `devpulse-a3550.firebaseapp.com` | From .env |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `devpulse-a3550` | From .env |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `devpulse-a3550.firebasestorage.app` | From .env |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `333842170391` | From .env |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:333842170391:web:5ec90ab16d055364345252` | From .env |

## Step 3: Enable Google Cloud APIs

```bash
gcloud services enable run.googleapis.com --project=$GCP_PROJECT_ID
gcloud services enable cloudbuild.googleapis.com --project=$GCP_PROJECT_ID
gcloud services enable cloudfunctions.googleapis.com --project=$GCP_PROJECT_ID
gcloud services enable containerregistry.googleapis.com --project=$GCP_PROJECT_ID
```

## Step 4: Initialize Firebase/Firestore

Run this once before deploying:

```bash
bash infra/setup-firebase.sh
```

## Step 5: Push to GitHub

```bash
git init
git add .
git commit -m "feat: Initial DevPulse setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/devpulse.git
git push -u origin main
```

## Step 6: Watch Deployments

1. Go to your GitHub repository
2. Click on "Actions" tab
3. Watch the workflows run automatically
4. Check the summary for deployment URLs

## Workflows

The following workflows will run automatically:

1. **Deploy Demo API** - Runs when `apps/demo-api/**` changes
2. **Deploy Webhook Receiver** - Runs when `apps/webhook-receiver/**` changes
3. **Deploy Dynatrace Tools** - Runs when `apps/dynatrace-tools/**` changes
4. **Deploy Dashboard** - Runs when `apps/dashboard/**` changes

## Manual Deployment

You can also trigger deployments manually:

1. Go to Actions tab
2. Select the workflow
3. Click "Run workflow"
4. Choose the branch and click "Run workflow"

## Verification

After deployments complete, you'll see URLs in the workflow summaries:

- **Demo API:** `https://devpulse-demo-api-xxxxx-uc.a.run.app`
- **Webhook Receiver:** `https://us-central1-devpaulse.cloudfunctions.net/webhookReceiver`
- **Dashboard:** `https://devpulse-dashboard-xxxxx-uc.a.run.app`
- **Dynatrace Tools:** `https://us-central1-devpaulse.cloudfunctions.net/get_problem_details` (and 4 others)

## Troubleshooting

### Deployment fails with "Permission Denied"

Make sure the service account has all required roles (see Step 1).

### "API not enabled" error

Run the API enablement commands from Step 3.

### Secrets not found

Double-check all secret names match exactly (case-sensitive).

### Build fails

Check the workflow logs in GitHub Actions for detailed error messages.
