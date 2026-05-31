# DevPulse Demo API

A deliberately-breakable Express.js service for testing incident response.

## Endpoints

### Production Endpoints

- **GET /healthz** - Health check (always returns 200 OK)
- **GET /todos** - List all todos
- **POST /todos** - Create a new todo
  ```bash
  curl -X POST http://localhost:8080/todos \
    -H "Content-Type: application/json" \
    -d '{"text":"Ship DevPulse"}'
  ```
- **GET /external** - Calls a flaky upstream service (returns 503)

### Chaos Engineering

- **POST /chaos** - Toggle failure modes
  ```bash
  # Enable error mode (500s on POST /todos)
  curl -X POST http://localhost:8080/chaos \
    -H "Content-Type: application/json" \
    -d '{"mode":"errors"}'

  # Enable latency mode (3-5s delays)
  curl -X POST http://localhost:8080/chaos \
    -H "Content-Type: application/json" \
    -d '{"mode":"latency"}'

  # Enable memory leak mode (5MB every 2s)
  curl -X POST http://localhost:8080/chaos \
    -H "Content-Type: application/json" \
    -d '{"mode":"memory"}'

  # Disable chaos
  curl -X POST http://localhost:8080/chaos \
    -H "Content-Type: application/json" \
    -d '{"mode":"off"}'
  ```

## Chaos Modes

| Mode | Effect | Incident Scenario |
|------|--------|------------------|
| `errors` | POST /todos returns 500 (TypeError) | Bad deploy - auth middleware removed |
| `latency` | All requests delayed 3-5 seconds | Performance degradation |
| `memory` | Memory leak: 5MB every 2s | Resource exhaustion |
| `off` | Normal operation | Baseline |

## Local Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Run with auto-reload
npm run dev
```

## Docker

```bash
# Build
docker build -t devpulse-demo-api .

# Run
docker run -p 8080:8080 devpulse-demo-api

# Test
curl http://localhost:8080/healthz
```

## Dynatrace Monitoring

When deployed to Cloud Run with Dynatrace OneAgent:

### Environment Variables Required

```bash
DT_TENANT=abc12345.live.dynatrace.com
DT_API_TOKEN=dt0c01.XXXXXXXXXXXX
DT_LOGLEVELCON=INFO
```

### What Dynatrace Monitors

- Request rate and throughput
- Response times (p50, p95, p99)
- Error rates
- Memory and CPU usage
- Distributed traces
- Service dependencies

### Triggering Incidents

1. Enable chaos mode
2. Generate load
3. Wait 2-5 minutes for Dynatrace Davis AI
4. Check Dynatrace → Problems for detected anomalies

## Testing Scenarios

### Scenario A: Bad Deploy (500 errors)

```bash
# Enable error mode
curl -X POST $API_URL/chaos -d '{"mode":"errors"}'

# Generate failing requests
for i in {1..50}; do
  curl -X POST $API_URL/todos -d '{"text":"test"}'
  sleep 0.3
done
```

**Expected Dynatrace Problem:**
- Error rate increased from 0% to ~100%
- Service: devpulse-demo-api
- Root cause: TypeError in POST /todos

### Scenario C: Performance Degradation

```bash
# Enable latency mode
curl -X POST $API_URL/chaos -d '{"mode":"latency"}'

# Generate slow requests
for i in {1..30}; do
  curl $API_URL/todos &
done
wait
```

**Expected Dynatrace Problem:**
- Response time degradation
- p99 latency spike from ~50ms to 3000-5000ms

## Architecture

```
┌─────────────────┐
│   Cloud Run     │
│  ┌───────────┐  │
│  │ demo-api  │  │
│  │  :8080    │  │
│  └─────┬─────┘  │
│        │        │
│  ┌─────▼─────┐  │
│  │ Dynatrace │  │
│  │ OneAgent  │  │
│  └───────────┘  │
└─────────────────┘
        │
        ▼
   Dynatrace
    Platform
```

## Files

- `index.js` - Express app with chaos middleware
- `package.json` - Dependencies (express only)
- `Dockerfile` - Container image definition
- `.dockerignore` - Files to exclude from build
