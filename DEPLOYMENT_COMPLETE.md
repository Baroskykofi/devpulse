# DevPulse Deployment Complete

All 4 services have been successfully deployed to Google Cloud Run!

## Deployed Services

| Service | URL | Status |
|---------|-----|--------|
| **Dashboard** | https://devpulse-dashboard-713434268138.us-central1.run.app | ✅ Running |
| **Demo API** | https://devpulse-demo-api-713434268138.us-central1.run.app | ✅ Deployed |
| **Webhook Receiver** | https://devpulse-webhook-receiver-713434268138.us-central1.run.app | ✅ Deployed |
| **Dynatrace Tools** | https://devpulse-dynatrace-tools-713434268138.us-central1.run.app | ✅ Deployed |

## Quick Test

Test the services manually:

```bash
# Dashboard (open in browser)
open https://devpulse-dashboard-713434268138.us-central1.run.app

# Demo API health check
curl https://devpulse-demo-api-713434268138.us-central1.run.app/healthz

# Webhook receiver health check
curl https://devpulse-webhook-receiver-713434268138.us-central1.run.app/healthz

# Dynatrace tools health check
curl https://devpulse-dynatrace-tools-713434268138.us-central1.run.app/healthz
```

## Next Steps

### 1. Configure Dynatrace Webhook

To connect Dynatrace to DevPulse:

1. Go to [Dynatrace Console](https://hhv66215.live.dynatrace.com)
2. Navigate to **Settings** → **Integration** → **Problem notifications**
3. Click **Add notification**
4. Select **Custom integration** (or **Webhook**)
5. Configure the webhook:
   - **Name**: `DevPulse Incident Webhook`
   - **Webhook URL**: `https://devpulse-webhook-receiver-713434268138.us-central1.run.app`
   - **HTTP Method**: `POST`
   - **Custom headers**: (none required)
   - **Custom payload**: Use the default Dynatrace problem payload or customize with:

   ```json
   {
     "problemId": "{PID}",
     "problemTitle": "{ProblemTitle}",
     "state": "{State}",
     "severityLevel": "{ProblemSeverity}",
     "impactedEntityNames": "{ImpactedEntity}"
   }
   ```

6. **Save** the notification
7. **Test** by clicking "Send test notification"

### 2. Monitor Demo API with Dynatrace

The demo-api service is ready for Dynatrace OneAgent monitoring:

1. Go to [Dynatrace Console](https://hhv66215.live.dynatrace.com)
2. Navigate to **Infrastructure** → **Hosts & Processes**
3. You should see `devpulse-demo-api` listed
4. Click on it to view metrics, logs, and traces

### 3. Test the Full Flow

Generate a test incident:

```bash
# Enable chaos mode to trigger errors
curl -X POST https://devpulse-demo-api-713434268138.us-central1.run.app/chaos \
  -H "Content-Type: application/json" \
  -d '{"mode":"errors"}'

# Make requests that will fail
for i in {1..20}; do
  curl -X POST https://devpulse-demo-api-713434268138.us-central1.run.app/todos \
    -H "Content-Type: application/json" \
    -d '{"text":"Test todo"}'
done

# Dynatrace will detect the errors and send a webhook to DevPulse
# Check the dashboard: https://devpulse-dashboard-713434268138.us-central1.run.app
```

### 4. View the Dashboard

Open the dashboard in your browser:
https://devpulse-dashboard-713434268138.us-central1.run.app

You should see:
- Active incidents list
- Incident details with metrics
- AI-generated recommendations
- Approval workflow

## Troubleshooting

### Check Cloud Run Logs

If a service isn't responding:

1. Go to [Cloud Run Console](https://console.cloud.google.com/run?project=devpaulse)
2. Click on the service name
3. Go to the **LOGS** tab
4. Look for errors or startup issues

### Common Issues

**404 Errors on health endpoints:**
- The services might still be starting up (can take 1-2 minutes)
- Check the logs in Cloud Run console
- Verify the service is set to "allow unauthenticated" traffic

**Webhook not receiving events:**
- Verify the webhook URL in Dynatrace settings
- Check webhook-receiver logs in Cloud Run
- Test with a manual curl request

**Dashboard not loading:**
- Check browser console for errors
- Verify Firebase configuration in Cloud Build substitution variables
- Check dashboard logs for startup errors

## Architecture Summary

```
Dynatrace → Webhook Receiver → Firestore → Dashboard
                ↓                    ↑
         Agent Builder ──────────────┘
                ↓
         Dynatrace Tools API
```

## Service Endpoints

### Demo API
- `GET /healthz` - Health check
- `GET /todos` - List todos
- `POST /todos` - Create todo
- `POST /chaos` - Enable chaos modes (errors, latency, memory)
- `GET /external` - Call flaky downstream service

### Webhook Receiver
- `GET /healthz` - Health check
- `POST /` - Receive Dynatrace problem webhooks

### Dynatrace Tools
- `GET /healthz` - Health check
- `POST /get_problem_details` - Get problem details from Dynatrace
- `POST /get_affected_entities` - Get affected entities
- `POST /query_metrics` - Query metrics
- `POST /fetch_logs` - Fetch logs
- `POST /write_reasoning_step` - Write reasoning step to Firestore

### Dashboard
- Next.js application with Firebase authentication
- Real-time incident list
- Incident details view
- Settings page

## What's Next?

- **Phase 3**: Configure Agent Builder tools (Dynatrace MCP server)
- **Phase 4**: Add Slack/PagerDuty integrations
- **Production**: Set up proper authentication and rate limiting

Congratulations! Your DevPulse deployment is complete! 🎉
