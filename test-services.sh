#!/bin/bash
# Test all deployed Cloud Run services

echo "Testing DevPulse Cloud Run Services"
echo "===================================="
echo ""

# Service URLs
DEMO_API="https://devpulse-demo-api-713434268138.us-central1.run.app"
WEBHOOK="https://devpulse-webhook-receiver-713434268138.us-central1.run.app"
TOOLS="https://devpulse-dynatrace-tools-713434268138.us-central1.run.app"
DASHBOARD="https://devpulse-dashboard-713434268138.us-central1.run.app"

echo "1. Testing Demo API /healthz"
curl -s "$DEMO_API/healthz" | jq . || echo "Failed"
echo ""

echo "2. Testing Webhook Receiver /healthz"
curl -s "$WEBHOOK/healthz" || echo "Failed"
echo ""

echo "3. Testing Dynatrace Tools /healthz"
curl -s "$TOOLS/healthz" || echo "Failed"
echo ""

echo "4. Testing Dashboard (root)"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$DASHBOARD"
echo ""

echo "===================================="
echo "All tests complete"
