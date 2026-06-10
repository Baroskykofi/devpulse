#!/bin/bash
# Fix Firestore permissions for Cloud Run services

set -e

PROJECT_ID="devpaulse"
FIREBASE_PROJECT_ID="devpulse-a3550"
REGION="us-central1"

echo "Setting up Firestore permissions for Cloud Run services..."
echo ""

# Get the default compute service account (used by Cloud Run by default)
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

echo "Service Account: ${SERVICE_ACCOUNT}"
echo ""

# Grant Firestore permissions to the service account
echo "Granting Firestore Data Editor role..."
gcloud projects add-iam-policy-binding ${FIREBASE_PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/datastore.user" \
    --condition=None

echo ""
echo "Granting Firebase Admin SDK access..."
gcloud projects add-iam-policy-binding ${FIREBASE_PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/firebase.admin" \
    --condition=None

echo ""
echo "✓ Permissions granted successfully!"
echo ""
echo "Now restart the Cloud Run services to pick up the new permissions:"
echo ""
echo "  gcloud run services update devpulse-webhook-receiver --region=${REGION} --project=${PROJECT_ID}"
echo "  gcloud run services update devpulse-dynatrace-tools --region=${REGION} --project=${PROJECT_ID}"
echo ""
