# Dynatrace Setup Guide

Complete guide to setting up Dynatrace monitoring for DevPulse.

---

## Step 1: Create Dynatrace Account

### Sign Up for Free Trial

1. Go to **https://www.dynatrace.com/trial/**
2. Click **Start free trial**
3. Fill in your details:
   - Email
   - Company name (can be personal)
   - Choose **SaaS** deployment
4. Select region:
   - **North America** if using `us-central1` Cloud Run
   - **Europe** if using `europe-west1`
   - **Asia Pacific** if using `asia-southeast1`

**Note:** No credit card required. 15-day full-featured trial.

### Access Your Environment

After signup:
1. Check your email for activation link
2. Click **Activate account**
3. Set your password
4. You'll be redirected to your Dynatrace dashboard

Your environment URL will be:
```
https://{YOUR_ENV_ID}.live.dynatrace.com
```

Example: `https://abc12345.live.dynatrace.com`

**Save this URL** - you'll need the environment ID.

---

## Step 2: Generate PaaS Token (for OneAgent)

This token allows Cloud Run to install the Dynatrace OneAgent.

### Navigate to PaaS Integration

1. In Dynatrace, click the **hamburger menu** (☰) top-left
2. Go to **Settings**
3. Expand **Cloud and virtualization**
4. Click **Platform as a Service**

### Create Token

1. Click **Generate new token**
2. Token name: `devpulse-cloud-run`
3. Click **Generate**
4. **Copy the token immediately** - it won't be shown again
5. Store in `.env` as `DYNATRACE_API_TOKEN`

Format: `dt0c01.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

---

## Step 3: Generate API Token (for Webhooks & MCP)

This token allows the agent to query problems, metrics, and logs.

### Navigate to Access Tokens

1. Dynatrace hamburger menu (☰)
2. **Access Tokens**
3. Click **Generate new token**

### Configure Token

1. Token name: `devpulse-api`
2. Expiration: **90 days** (or longer)
3. **Required scopes** - enable these:

   #### Problem & Event Data
   - ✅ `problems.read` - Read problems
   - ✅ `events.read` - Read events

   #### Infrastructure & Services
   - ✅ `entities.read` - Read entities
   - ✅ `metrics.read` - Read metrics

   #### Logs
   - ✅ `logs.read` - Read logs
   - ✅ `logs.ingest` - Ingest logs (optional)

4. Click **Generate**
5. **Copy the token**
6. Store in `.env` as `DYNATRACE_API_KEY`

---

## Step 4: Configure Cloud Run for OneAgent

### Option A: Deploy with Script (Recommended)

The deployment script (`phase1-deploy.sh`) automatically configures OneAgent if these variables are in `.env`:

```bash
DYNATRACE_ENVIRONMENT_ID=abc12345.live.dynatrace.com
DYNATRACE_API_TOKEN=dt0c01.XXXXXXXXXXXX  # PaaS token
```

### Option B: Manual Configuration

If deploying manually:

```bash
gcloud run deploy devpulse-demo-api \
    --image gcr.io/$GCP_PROJECT_ID/devpulse-demo-api \
    --region us-central1 \
    --set-env-vars DT_TENANT=$DYNATRACE_ENVIRONMENT_ID \
    --set-env-vars DT_API_TOKEN=$DYNATRACE_API_TOKEN \
    --set-env-vars DT_LOGLEVELCON=INFO
```

### Verify Environment Variables

```bash
gcloud run services describe devpulse-demo-api \
    --region us-central1 \
    --format yaml | grep -A 5 env:
```

Should show:
```yaml
env:
- name: DT_TENANT
  value: abc12345.live.dynatrace.com
- name: DT_API_TOKEN
  value: dt0c01.XXXX
- name: DT_LOGLEVELCON
  value: INFO
```

---

## Step 5: Verify Monitoring is Active

### Check Host Monitoring

1. Dynatrace → **Infrastructure** → **Hosts**
2. Wait **2-3 minutes** after Cloud Run deployment
3. You should see a new host representing your Cloud Run instance

**Troubleshooting:** If no host appears:
- Verify environment variables are set correctly
- Check Cloud Run logs: `gcloud run services logs read devpulse-demo-api --region us-central1`
- Look for OneAgent initialization messages

### Check Service Monitoring

1. Dynatrace → **Services**
2. Filter by: "devpulse"
3. You should see: **devpulse-demo-api**
4. Click on it to view:
   - **Response time** (should be low, ~10-50ms)
   - **Failure rate** (should be 0%)
   - **Throughput** (requests per minute)

**If service doesn't appear:**
- Generate some traffic first: `curl $API_URL/healthz` (multiple times)
- Wait 1-2 minutes for Dynatrace to aggregate data

---

## Step 6: Configure Alerting Profiles

### Create Custom Alerting Profile

1. Dynatrace → **Settings** → **Anomaly detection** → **Custom alerts**
2. Click **Create custom alert**
3. Name: `DevPulse Incidents`

### Configure Problem Detection

#### Error Rate
1. Click **Add new metric condition**
2. Select: **Service → Failure rate**
3. Threshold: **> 5%** (trigger if error rate exceeds 5%)
4. Duration: **2 minutes** (sustained for 2 min)

#### Response Time
1. Add another condition
2. Select: **Service → Response time (p95)**
3. Threshold: **> 2000ms** (p95 above 2 seconds)
4. Duration: **2 minutes**

#### Apply to Services
- **Filter by:** Service name contains `devpulse`
- Or apply to **all services**

---

## Step 7: Configure Problem Notifications (Webhook)

This will be completed in **Phase 2**, but you can set it up now.

### Create Custom Integration

1. Dynatrace → **Settings** → **Integration** → **Problem notifications**
2. Click **Add notification**
3. Choose: **Custom integration**

### Configure Webhook

1. **Name:** `DevPulse Webhook`
2. **Webhook URL:**
   - Leave blank for now
   - Will be filled after deploying webhook-receiver in Phase 2
3. **Payload:**
   ```json
   {
     "problemId": "{ProblemID}",
     "problemTitle": "{ProblemTitle}",
     "state": "{State}",
     "severityLevel": "{ProblemSeverity}",
     "impactedEntityNames": {ImpactedEntityNames}
   }
   ```
4. **HTTP Headers:**
   - `Content-Type: application/json`
5. **Alerting profile:** Select `DevPulse Incidents` (created above)
6. **Save** (even without URL - we'll update later)

---

## Step 8: Test Problem Detection

### Generate Baseline Traffic

```bash
export API_URL=$(cat infra/phase1-outputs.env | grep DEMO_API_URL | cut -d'=' -f2)

# Generate normal requests
for i in {1..30}; do
  curl $API_URL/healthz
  sleep 1
done
```

### Trigger an Incident

```bash
# Enable error chaos mode
curl -X POST $API_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"errors"}'

# Generate failing requests
for i in {1..50}; do
  curl -X POST $API_URL/todos \
    -H "Content-Type: application/json" \
    -d '{"text":"test"}' || true
  sleep 0.5
done
```

### Monitor Problem Detection

1. Dynatrace → **Problems**
2. Wait **2-5 minutes** for Davis AI to detect anomaly
3. You should see a new problem:
   - **Title:** Error rate increase
   - **Severity:** ERROR or AVAILABILITY
   - **Affected service:** devpulse-demo-api
   - **Root cause:** Davis AI analysis

### Examine Problem Details

Click on the problem to view:
- **Timeline** showing when error rate spiked
- **Root cause analysis** by Davis AI
- **Affected entities** (service, process, host)
- **Related events** (deployments, config changes)
- **Metric charts** showing error rate jump

---

## API Token Scopes Reference

For future reference, here are all the scopes you might need:

### Core Agent Scopes
- `problems.read` - Query problems
- `entities.read` - Get affected entities
- `metrics.read` - Query time-series metrics
- `logs.read` - Fetch log lines

### Optional Scopes (for Phase 3+)
- `events.read` - Read deployment events
- `events.ingest` - Send custom events
- `settings.read` - Read configuration
- `slo.read` - Read SLO data

---

## Dynatrace UI Quick Reference

| Feature | Navigation Path |
|---------|----------------|
| Service overview | Services → devpulse-demo-api |
| Active problems | Problems (left sidebar) |
| Problem history | Problems → Filter → Time range |
| Metric explorer | Observe and explore → Metrics |
| Logs | Observe and explore → Logs |
| Distributed traces | Observe and explore → Distributed traces |
| Service dependencies | Services → devpulse-demo-api → Service flow |

---

## Troubleshooting

### OneAgent Not Reporting

**Check environment variables:**
```bash
gcloud run services describe devpulse-demo-api \
  --region us-central1 \
  --format json | jq '.spec.template.spec.containers[0].env'
```

**Check Cloud Run logs:**
```bash
gcloud run services logs read devpulse-demo-api \
  --region us-central1 \
  --limit 100 | grep -i dynatrace
```

**Look for:**
- `Dynatrace OneAgent injected successfully`
- `Connected to Dynatrace cluster`

**If missing:**
- Redeploy with correct `DT_TENANT` and `DT_API_TOKEN`
- Verify PaaS token has not expired

### No Problems Detected

**Verify alerting profile is enabled:**
- Settings → Anomaly detection → Custom alerts → DevPulse Incidents

**Check metric thresholds:**
- Error rate threshold might be too high
- Reduce to `> 2%` if needed

**Manually verify metrics:**
- Services → devpulse-demo-api → View response time chart
- Should show spike during chaos mode

### API Token Invalid

**Regenerate token:**
1. Access Tokens → Find `devpulse-api`
2. Click **Revoke**
3. Generate new token with same scopes
4. Update `.env` with new token

---

## Success Criteria

✅ **Dynatrace setup is complete when:**

1. OneAgent shows up under **Infrastructure → Hosts**
2. **devpulse-demo-api** appears under **Services**
3. Triggering chaos mode generates metrics in Dynatrace
4. A **Problem** is created within 5 minutes of triggering chaos
5. Problem details show clear root cause analysis

---

## Next: Configure Webhooks

Once you've verified problem detection works:
- Proceed to **Phase 2** to deploy webhook-receiver
- Update Dynatrace problem notification with webhook URL
- Test end-to-end incident response flow

---

## Additional Resources

- [Dynatrace Documentation](https://www.dynatrace.com/support/help/)
- [OneAgent Installation Guide](https://www.dynatrace.com/support/help/setup-and-configuration/dynatrace-oneagent)
- [Problem API Reference](https://www.dynatrace.com/support/help/dynatrace-api/environment-api/problems-v2)
- [Custom Alerts Guide](https://www.dynatrace.com/support/help/how-to-use-dynatrace/problem-detection-and-analysis/problem-detection/custom-alerts)
