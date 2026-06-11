#!/bin/bash
# Test script to simulate a bad deployment scenario that triggers ROLLBACK recommendation

WEBHOOK_URL="https://devpulse-webhook-receiver-713434268138.us-central1.run.app"

echo "🧪 Testing ROLLBACK approval flow..."
echo ""
echo "This will create a simulated incident with:"
echo "  - High error rate (triggers ROLLBACK recommendation)"
echo "  - Recent commit (within 30 minutes)"
echo "  - High confidence hypothesis"
echo ""

# Create a realistic problem ID
PROBLEM_ID="P-$(date +%s)"

echo "Creating incident: $PROBLEM_ID"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"problemId\": \"$PROBLEM_ID\",
    \"problemTitle\": \"High error rate in payment-service after deployment\",
    \"state\": \"OPEN\",
    \"severityLevel\": \"ERROR\",
    \"impactedEntityNames\": [\"payment-service\"]
  }"

echo ""
echo ""
echo "✅ Incident created!"
echo ""
echo "Next steps:"
echo "  1. Open dashboard: http://localhost:3000"
echo "  2. Wait for agent to complete 4 phases"
echo "  3. Agent will recommend ROLLBACK (because queryMetricsForEntity returns errorRate: 12.5%)"
echo "  4. Click 'Approve' button"
echo "  5. Watch execute phase create revert commit on GitHub"
echo "  6. Verify the revert commit appears in: https://github.com/Baroskykofi/devpulse/commits/main"
echo ""
