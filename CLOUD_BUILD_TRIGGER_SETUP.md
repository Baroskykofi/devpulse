# Cloud Build Trigger Setup - Substitution Variables

When creating your Cloud Build trigger, you need to configure substitution variables with your actual values from `.env`.

## Step-by-Step Setup

### 1. Create Trigger

Go to: https://console.cloud.google.com/cloud-build/triggers?project=devpaulse

Click **"CREATE TRIGGER"**

### 2. Basic Configuration

- **Name:** `deploy-all-services`
- **Event:** Push to a branch
- **Repository:** `Baroskykofi/devpulse`
- **Branch:** `^main$`
- **Configuration:** Cloud Build configuration file (yaml)
- **Location:** `cloudbuild.yaml`

### 3. Substitution Variables

Click **"SHOW INCLUDED FIELDS"** → **"ADD VARIABLE"**

Add these variables (**copy values from your `.env` file**):

| Variable Name | Value (from your .env) |
|---------------|------------------------|
| `_REGION` | `us-central1` |
| `_DYNATRACE_ENVIRONMENT_ID` | Copy from .env `DYNATRACE_ENVIRONMENT_ID` |
| `_DYNATRACE_API_TOKEN` | Copy from .env `DYNATRACE_API_TOKEN` |
| `_DYNATRACE_API_KEY` | Copy from .env `DYNATRACE_API_KEY` |
| `_FIRESTORE_PROJECT_ID` | Copy from .env `FIRESTORE_PROJECT_ID` |
| `_AGENT_BUILDER_AGENT_ID` | Copy from .env `AGENT_BUILDER_AGENT_ID` |
| `_NEXT_PUBLIC_FIREBASE_API_KEY` | Copy from .env `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Copy from .env `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `_NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Copy from .env `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Copy from .env `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Copy from .env `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `_NEXT_PUBLIC_FIREBASE_APP_ID` | Copy from .env `NEXT_PUBLIC_FIREBASE_APP_ID` |

### 4. Save

Click **"CREATE"**

---

## Quick Copy Reference (Open your .env file)

```bash
# View your actual values
cat .env | grep -E "(DYNATRACE|FIREBASE|FIRESTORE|AGENT_BUILDER)"
```

Your values:
- DYNATRACE_ENVIRONMENT_ID: `hhv66215.live.dynatrace.com`
- DYNATRACE_API_TOKEN: (from your .env)
- DYNATRACE_API_KEY: (from your .env)
- FIRESTORE_PROJECT_ID: `devpulse-a3550`
- AGENT_BUILDER_AGENT_ID: `ec726e22-6a27-4d3b-bea6-947a11380b09`
- NEXT_PUBLIC_FIREBASE_PROJECT_ID: `devpulse-a3550`
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: `333842170391`

(Copy other NEXT_PUBLIC_* values from your .env)

---

## After Creating Trigger

### Deploy Automatically

Every push to main will trigger deployment:

```bash
git push origin main
```

### Or Trigger Manually

Go to Cloud Build Triggers → Click "RUN" on your trigger

---

## Verify Substitution Variables

After creating the trigger:

1. Click on the trigger name
2. Scroll to "Substitution variables"
3. Verify all 12 variables are set correctly

---

## Security Note

✅ Variables stored securely in Google Cloud
✅ Not exposed in repository
✅ Only accessible to Cloud Build service account
