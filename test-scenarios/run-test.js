#!/usr/bin/env node
// test-scenarios/run-test.js
// Test framework for running scripted incidents and evaluating agent reasoning

const scenarios = require("./scenarios.json");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// ─── Test Runner ──────────────────────────────────────────────────────

async function runScenario(scenarioId) {
  const scenario = scenarios[scenarioId];

  if (!scenario) {
    console.error(`❌ Scenario ${scenarioId} not found`);
    process.exit(1);
  }

  console.log(`\n🧪 Running scenario: ${scenario.name}`);
  console.log(`📝 Description: ${scenario.description}\n`);

  const incidentId = `TEST-${scenarioId}-${Date.now()}`;

  // 1. Create incident in Firestore
  console.log(`Creating incident ${incidentId}...`);
  await db
    .collection("incidents")
    .doc(incidentId)
    .set({
      ...scenario.incident,
      startedAt: new Date(),
      testScenario: scenarioId,
    });

  console.log(`✅ Incident created\n`);

  // 2. Simulate agent orchestration (in production, this would invoke Cloud Function)
  console.log(`🤖 Agent would now process this incident through:`);
  console.log(`   1. Observe phase - Pull Dynatrace data`);
  console.log(`   2. Correlate phase - Check recent commits`);
  console.log(`   3. Hypothesize phase - Form hypothesis`);
  console.log(`   4. Recommend phase - Propose action`);
  console.log(`   5. Wait for approval\n`);

  // 3. Wait for reasoning to complete (polling)
  console.log(`⏳ Waiting for agent to complete reasoning...`);
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds

  while (attempts < maxAttempts) {
    const incidentSnap = await db.collection("incidents").doc(incidentId).get();
    const data = incidentSnap.data();

    if (data?.reasoningState?.phase === "waiting" || data?.reasoningState?.phase === "complete") {
      console.log(`✅ Agent completed reasoning\n`);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  if (attempts >= maxAttempts) {
    console.log(`⚠️  Timeout waiting for agent\n`);
  }

  // 4. Fetch and display results
  const incidentSnap = await db.collection("incidents").doc(incidentId).get();
  const incident = incidentSnap.data();

  console.log(`─────────────────────────────────────────`);
  console.log(`RESULTS FOR ${scenarioId}`);
  console.log(`─────────────────────────────────────────\n`);

  // Display hypothesis
  if (incident.hypothesis) {
    console.log(`🔍 Hypothesis:`);
    console.log(`   Suspect: ${incident.hypothesis.suspect}`);
    console.log(`   Confidence: ${incident.hypothesis.confidence}`);
    console.log(`   Evidence:`);
    (incident.hypothesis.evidence || []).forEach((e) => console.log(`     - ${e}`));
    console.log();
  }

  // Display recommendation
  if (incident.recommendation) {
    console.log(`💡 Recommendation:`);
    console.log(`   Action: ${incident.recommendation.action}`);
    console.log(`   Description: ${incident.recommendation.description}`);
    console.log();
  }

  // Compare with expected outcome
  const expected = scenario.expectedOutcome;
  let passed = true;

  console.log(`✓ EXPECTED vs ACTUAL:\n`);

  if (expected.hypothesis) {
    const hypothesisMatch = incident.hypothesis?.suspect === expected.hypothesis.suspect;
    const confidenceMatch = incident.hypothesis?.confidence === expected.hypothesis.confidence;

    console.log(`   Hypothesis suspect: ${hypothesisMatch ? "✅" : "❌"}`);
    console.log(`     Expected: ${expected.hypothesis.suspect}`);
    console.log(`     Actual:   ${incident.hypothesis?.suspect || "none"}`);

    console.log(`   Confidence: ${confidenceMatch ? "✅" : "❌"}`);
    console.log(`     Expected: ${expected.hypothesis.confidence}`);
    console.log(`     Actual:   ${incident.hypothesis?.confidence || "none"}`);

    passed = passed && hypothesisMatch && confidenceMatch;
  }

  if (expected.recommendation) {
    const actionMatch = incident.recommendation?.action === expected.recommendation.action;

    console.log(`   Recommendation: ${actionMatch ? "✅" : "❌"}`);
    console.log(`     Expected: ${expected.recommendation.action}`);
    console.log(`     Actual:   ${incident.recommendation?.action || "none"}`);

    passed = passed && actionMatch;
  }

  console.log();

  // Get reasoning steps
  const stepsSnap = await db
    .collection("incidents")
    .doc(incidentId)
    .collection("steps")
    .orderBy("timestamp")
    .get();

  console.log(`📊 Reasoning steps (${stepsSnap.size}):\n`);
  stepsSnap.docs.forEach((doc, i) => {
    const step = doc.data();
    console.log(`   ${i + 1}. [${step.phase}] ${step.label}`);
  });

  console.log();
  console.log(`─────────────────────────────────────────`);
  console.log(passed ? `✅ TEST PASSED` : `❌ TEST FAILED`);
  console.log(`─────────────────────────────────────────\n`);

  return { scenarioId, passed, incident };
}

// ─── Run All Scenarios ────────────────────────────────────────────────

async function runAllScenarios() {
  console.log(`\n🚀 DevPulse Prompt Engineering Test Suite\n`);

  const results = [];

  for (const scenarioId of Object.keys(scenarios)) {
    const result = await runScenario(scenarioId);
    results.push(result);

    // Wait between scenarios
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Summary
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`SUMMARY`);
  console.log(`═══════════════════════════════════════════\n`);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`Tests run: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success rate: ${Math.round((passed / total) * 100)}%\n`);

  results.forEach((r) => {
    console.log(`  ${r.passed ? "✅" : "❌"} ${r.scenarioId}`);
  });

  console.log();

  process.exit(passed === total ? 0 : 1);
}

// ─── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0) {
  // Run all scenarios
  runAllScenarios().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
} else {
  // Run specific scenario
  runScenario(args[0]).catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
