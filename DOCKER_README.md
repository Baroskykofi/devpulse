# DevPulse Docker Deployment Guide

Deploy DevPulse using Docker - test locally or deploy to Google Cloud Run.

---

## Option 1: Test Locally with Docker Compose

### Prerequisites
- Docker Desktop installed
- Docker Compose installed

### Steps

1. **Start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Access services:**
   - Demo API: http://localhost:8080
   - Webhook Receiver: http://localhost:8081
   - Dynatrace Tools: http://localhost:8082
   - Dashboard: http://localhost:3000

3. **Test endpoints:**
   ```bash
   # Health check
   curl http://localhost:8080/healthz

   # Get todos
   curl http://localhost:8080/todos

   # Trigger chaos mode
   curl -X POST http://localhost:8080/chaos \
     -H "Content-Type: application/json" \
     -d '{"mode":"errors"}'
   ```

4. **Stop services:**
   ```bash
   docker-compose down
   ```

---

## Option 2: Deploy to Google Cloud Run

### Prerequisites
- Google Cloud SDK installed
- Docker installed
- Logged into `gcloud`: `gcloud auth login`

### Quick Deploy

```bash
# Make script executable
chmod +x deploy-docker.sh

# Run deployment
./deploy-docker.sh
```

This will:
1. Build Docker images for all services
2. Push to Google Container Registry (GCR)
3. Deploy to Cloud Run
4. Output service URLs

### Manual Deployment

If you prefer to deploy services one at a time:

```bash
# Load environment
source .env

# Configure Docker for GCR
gcloud auth configure-docker

# Deploy Demo API
cd apps/demo-api
docker build -t gcr.io/$GCP_PROJECT_ID/devpulse-demo-api:latest .
docker push gcr.io/$GCP_PROJECT_ID/devpulse-demo-api:latest
gcloud run deploy devpulse-demo-api \
  --image gcr.io/$GCP_PROJECT_ID/devpulse-demo-api:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080

# Repeat for other services...
```

---

## Docker Images

The project includes Dockerfiles for:

- **apps/demo-api/Dockerfile** - Express.js API with Dynatrace OneAgent
- **apps/webhook-receiver/Dockerfile** - Webhook handler Cloud Function
- **apps/dynatrace-tools/Dockerfile** - Dynatrace API tools
- **apps/dashboard/Dockerfile** - Next.js dashboard (multi-stage build)

---

## Environment Variables

All services use environment variables from `.env`:

### Demo API
- `DT_TENANT` - Dynatrace environment ID
- `DT_API_TOKEN` - Dynatrace API token

### Webhook Receiver
- `FIRESTORE_PROJECT_ID` - Firebase project ID
- `AGENT_BUILDER_PROJECT` - GCP project ID
- `AGENT_BUILDER_LOCATION` - GCP region
- `AGENT_BUILDER_AGENT_ID` - Agent Builder agent ID

### Dynatrace Tools
- `DYNATRACE_ENVIRONMENT_ID` - Dynatrace environment
- `DYNATRACE_API_KEY` - API key for Dynatrace
- `FIRESTORE_PROJECT_ID` - Firebase project ID

### Dashboard
- `NEXT_PUBLIC_FIREBASE_*` - Firebase web config

---

## Troubleshooting

### Local Development

**Port already in use:**
```bash
# Change ports in docker-compose.yml
ports:
  - "8090:8080"  # Use 8090 instead of 8080
```

**Container fails to start:**
```bash
# Check logs
docker-compose logs demo-api

# Rebuild from scratch
docker-compose up --build --force-recreate
```

**Firebase auth errors:**
You need a service account key for local development:
```bash
# Download from Firebase Console
# Save as service-account-key.json in project root
```

### Cloud Deployment

**Permission denied:**
```bash
gcloud auth login
gcloud config set project $GCP_PROJECT_ID
```

**Image push fails:**
```bash
gcloud auth configure-docker
```

**Service deployment fails:**
```bash
# Check Cloud Run logs
gcloud run services logs read devpulse-demo-api --region us-central1
```

---

## CI/CD with Docker

GitHub Actions workflows already use Docker:
- See `.github/workflows/deploy-*.yml`
- Each workflow builds, pushes, and deploys Docker images
- Triggered automatically on push to main

---

## Comparison: Docker vs Shell Scripts

| Method | Pros | Cons |
|--------|------|------|
| **Docker Compose** | Local testing, consistent environment | Requires Docker Desktop |
| **deploy-docker.sh** | Simple one-command deployment | Requires gcloud CLI |
| **GitHub Actions** | Automated CI/CD, no local setup | Requires GitHub secrets setup |
| **Shell scripts** | Granular control | More manual steps |

**Recommendation:** Use Docker Compose for local testing, then deploy via `deploy-docker.sh` or GitHub Actions.

---

## Quick Reference

```bash
# Local testing
docker-compose up --build

# Deploy to Cloud Run
./deploy-docker.sh

# Build single service
docker build -t gcr.io/$GCP_PROJECT_ID/devpulse-demo-api apps/demo-api

# Run single service locally
docker run -p 8080:8080 --env-file .env gcr.io/$GCP_PROJECT_ID/devpulse-demo-api

# Clean up images
docker system prune -a
```
