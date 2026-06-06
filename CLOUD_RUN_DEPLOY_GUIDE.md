# Deploy DevPulse via Cloud Run Dashboard (GitHub Integration)

Deploy all DevPulse services directly from the Cloud Run console by connecting your GitHub repository.

---

## Prerequisites

1. ✅ GitHub repository: `https://github.com/Baroskykofi/devpulse.git`
2. ✅ Google Cloud Project: `devpaulse`
3. ✅ Push all code to GitHub main branch

---

## Step 1: Push Code to GitHub

```bash
cd "c:\Users\Gbegbeawu Daniel\Downloads\devpulse"

git add .
git commit -m "feat: Add Docker deployment configs"
git push origin main
```

---

## Step 2: Deploy Services via Cloud Run Dashboard

Open Cloud Run: https://console.cloud.google.com/run?project=devpaulse

### Service 1: Demo API

1. **Click "CREATE SERVICE"**

2. **Source: Deploy one revision from an existing container image**
   - Select: "Continuously deploy new revisions from a source repository"
   - Click "SET UP WITH CLOUD BUILD"

3. **Repository:**
   - Provider: GitHub
   - Repository: `Baroskykofi/devpulse`
   - Branch: `^main$`
   - Click "NEXT"

4. **Build Configuration:**
   - Build Type: **Dockerfile**
   - Source location: `/apps/demo-api/Dockerfile`
   - Click "SAVE"

5. **Configure Service:**
   - Service name: `devpulse-demo-api`
   - Region: `us-central1`
   - CPU allocation: "CPU is always allocated"
   - Autoscaling: Min 0, Max 10
   - Authentication: "Allow unauthenticated invocations" ✅

6. **Container settings:**
   - Container port: `8080`
   - Memory: `512 MiB`
   - CPU: `1`

7. **Environment Variables (expand "VARIABLES & SECRETS"):**
   ```
   DT_TENANT = [Your Dynatrace Environment ID from .env]
   DT_API_TOKEN = [Your Dynatrace API Token from .env]
   DT_LOGLEVELCON = INFO
   ```

8. **Click "CREATE"**

Wait 3-5 minutes for build and deployment.

✅ **Copy the service URL** (e.g., `https://devpulse-demo-api-xxxxx-uc.a.run.app`)

---

### Service 2: Webhook Receiver

1. **Click "CREATE SERVICE"** (in Cloud Run console)

2. **Source:**
   - Select: "Continuously deploy from repository"
   - Click "SET UP WITH CLOUD BUILD"

3. **Repository:**
   - Provider: GitHub
   - Repository: `Baroskykofi/devpulse`
   - Branch: `^main$`

4. **Build Configuration:**
   - Build Type: **Dockerfile**
   - Source location: `/apps/webhook-receiver/Dockerfile`
   - Click "SAVE"

5. **Configure Service:**
   - Service name: `devpulse-webhook-receiver`
   - Region: `us-central1`
   - Allow unauthenticated ✅

6. **Container settings:**
   - Container port: `8080`
   - Memory: `512 MiB`

7. **Environment Variables:**
   ```
   FIRESTORE_PROJECT_ID = devpulse-a3550
   AGENT_BUILDER_PROJECT = devpaulse
   AGENT_BUILDER_LOCATION = us-central1
   AGENT_BUILDER_AGENT_ID = ec726e22-6a27-4d3b-bea6-947a11380b09
   ```

8. **Click "CREATE"**

✅ **Copy the webhook URL** - you'll need this for Dynatrace configuration

---

### Service 3: Dynatrace Tools

1. **Click "CREATE SERVICE"**

2. **Repository setup:**
   - Repository: `Baroskykofi/devpulse`
   - Branch: `^main$`

3. **Build Configuration:**
   - Build Type: **Dockerfile**
   - Source location: `/apps/dynatrace-tools/Dockerfile`

4. **Configure Service:**
   - Service name: `devpulse-dynatrace-tools`
   - Region: `us-central1`
   - Allow unauthenticated ✅

5. **Container settings:**
   - Container port: `8080`
   - Memory: `512 MiB`

6. **Environment Variables:**
   ```
   DYNATRACE_ENVIRONMENT_ID = [Your Dynatrace Environment ID from .env]
   DYNATRACE_API_KEY = [Your Dynatrace API Key from .env]
   FIRESTORE_PROJECT_ID = [Your Firestore Project ID from .env]
   ```

7. **Click "CREATE"**

✅ **Copy the tools service URL**

---

### Service 4: Dashboard

1. **Click "CREATE SERVICE"**

2. **Repository setup:**
   - Repository: `Baroskykofi/devpulse`
   - Branch: `^main$`

3. **Build Configuration:**
   - Build Type: **Dockerfile**
   - Source location: `/apps/dashboard/Dockerfile`

4. **Configure Service:**
   - Service name: `devpulse-dashboard`
   - Region: `us-central1`
   - Allow unauthenticated ✅

5. **Container settings:**
   - Container port: `3000`
   - Memory: `512 MiB`

6. **Environment Variables:**
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY = AIzaSyBUR2l9DG5y8Y4atejRr4UDNeYNmQ5ypic
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = devpulse-a3550.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID = devpulse-a3550
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = devpulse-a3550.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 333842170391
   NEXT_PUBLIC_FIREBASE_APP_ID = 1:333842170391:web:5ec90ab16d055364345252
   ```

7. **Click "CREATE"**

✅ **Copy the dashboard URL** and open it in your browser!

---

## Step 3: Verify Deployments

Visit Cloud Run console: https://console.cloud.google.com/run?project=devpaulse

You should see all 4 services:
- ✅ devpulse-demo-api
- ✅ devpulse-webhook-receiver
- ✅ devpulse-dynatrace-tools
- ✅ devpulse-dashboard

Click each service to see:
- ✅ Status: Ready (green checkmark)
- ✅ Latest revision deployed
- ✅ Service URL

---

## Step 4: Test Your Deployment

### Test Demo API

```bash
# Replace with your actual URL
export DEMO_API_URL=https://devpulse-demo-api-xxxxx-uc.a.run.app

# Health check
curl $DEMO_API_URL/healthz

# Get todos
curl $DEMO_API_URL/todos

# Trigger chaos mode
curl -X POST $DEMO_API_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"errors"}'
```

### Test Webhook Receiver

```bash
export WEBHOOK_URL=https://devpulse-webhook-receiver-xxxxx-uc.a.run.app

curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "TEST-001",
    "problemTitle": "Test incident",
    "state": "OPEN",
    "severityLevel": "ERROR"
  }'
```

### Test Dashboard

Open in browser: `https://devpulse-dashboard-xxxxx-uc.a.run.app`

---

## Step 5: Configure Dynatrace Webhook

1. **Open Dynatrace:** https://hhv66215.live.dynatrace.com

2. **Navigate to:**
   Settings → Integration → Problem notifications

3. **Add notification:**
   - Type: Custom integration
   - Name: `DevPulse Webhook`
   - Webhook URL: `[Your webhook-receiver URL]`
   - Method: POST

4. **Payload template:**
   ```json
   {
     "problemId": "{ProblemID}",
     "problemTitle": "{ProblemTitle}",
     "state": "{State}",
     "severityLevel": "{ProblemSeverity}",
     "impactedEntityNames": {ImpactedEntityNames}
   }
   ```

5. **Headers:**
   ```
   Content-Type: application/json
   ```

6. **Save and test**

---

## Automatic Redeployment

Once connected, Cloud Run will automatically:
- ✅ Rebuild when you push to GitHub
- ✅ Deploy new revisions
- ✅ Gradually shift traffic to new version
- ✅ Keep previous versions for rollback

**Trigger a redeploy:**
```bash
git add .
git commit -m "update: Feature improvements"
git push origin main
```

---

## Monitoring and Logs

**View logs:**
1. Go to Cloud Run console
2. Click on service name
3. Click "LOGS" tab

**View metrics:**
- Request count
- Request latency
- Container CPU/Memory usage
- Error rate

**Set up alerts:**
Settings → Alerting → Create Alert Policy

---

## Troubleshooting

### Build fails

**Check Cloud Build logs:**
https://console.cloud.google.com/cloud-build/builds?project=devpaulse

**Common issues:**
- ❌ Dockerfile path incorrect → Check `/apps/[service]/Dockerfile`
- ❌ Missing package.json → Ensure all files committed to GitHub
- ❌ npm install fails → Check Node.js version in Dockerfile

### Service fails to start

**Check Cloud Run logs:**
Click service → LOGS tab

**Common issues:**
- ❌ Port mismatch → Verify container port matches Dockerfile EXPOSE
- ❌ Missing env vars → Check all required variables are set
- ❌ Firestore permission denied → Verify service account permissions

### Can't access service

**Check authentication:**
- Ensure "Allow unauthenticated invocations" is enabled
- Or configure Cloud IAM for authenticated access

---

## Cost Optimization

Cloud Run pricing:
- **Free tier:** 2 million requests/month
- **Pay per use:** Only charged when requests are being handled
- **Min instances 0:** No cost when idle

**Tips:**
- Set max instances to control costs
- Use min instances 0 for development
- Enable request timeout (default 300s)

---

## Summary

| Service | Purpose | Port | URL |
|---------|---------|------|-----|
| demo-api | Express.js API | 8080 | Copy from Cloud Run |
| webhook-receiver | Incident handler | 8080 | Copy from Cloud Run |
| dynatrace-tools | API tools | 8080 | Copy from Cloud Run |
| dashboard | Next.js UI | 3000 | Copy from Cloud Run |

**Next:** Configure Dynatrace webhook → Test end-to-end incident flow → Monitor in dashboard!
