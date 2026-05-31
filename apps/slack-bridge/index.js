// apps/slack-bridge/index.js
// Cloud Function — Slack Bolt app.
// Two responsibilities:
//   1. post_incident_summary: called by the agent to post Block Kit messages to #on-call
//   2. Handle button clicks (Approve / Reject) and write approvalStatus to Firestore

const { onRequest } = require("firebase-functions/v2/http");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { App, ExpressReceiver } = require("@slack/bolt");
const express = require("express");

initializeApp();
const db = getFirestore();

// ─── Slack app init ───────────────────────────────────────────────
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  app: express(),
});

const slack = new App({
  token:    process.env.SLACK_BOT_TOKEN,
  receiver,
});

// ─── Block Kit message builder ────────────────────────────────────
function buildIncidentBlocks(inc) {
  const severityEmoji = inc.severity === "critical" ? "🔴" : "🟡";
  const confidenceEmoji = {
    high:   "🎯 HIGH",
    medium: "⚠️  MEDIUM",
    low:    "❓ LOW",
  }[inc.hypothesis?.confidence ?? "low"];

  const evidenceBullets = (inc.hypothesis?.evidence ?? [])
    .slice(0, 3)
    .map(e => `> • ${e}`)
    .join("\n");

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `${severityEmoji}  ${inc.title}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Problem ID:*\n\`${inc.dynatraceProblemId}\`` },
        { type: "mrkdwn", text: `*Service:*\n${inc.service}` },
        { type: "mrkdwn", text: `*Error Rate:*\n${inc.metrics?.errorRate?.toFixed(1)}%` },
        { type: "mrkdwn", text: `*p99 Latency:*\n${inc.metrics?.p99Latency}ms` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Hypothesis* (${confidenceEmoji}):\n${inc.hypothesis?.suspect ?? "—"}\n\n${evidenceBullets}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Recommendation:* \`${inc.recommendation?.action ?? "—"}\` — ${inc.recommendation?.description ?? ""}`,
      },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "✅  Approve Rollback" },
          action_id: "approve_rollback",
          value: inc.id,
          confirm: {
            title: { type: "plain_text", text: "Confirm rollback?" },
            text:  { type: "mrkdwn",     text: `This will revert commit \`${inc.recommendation?.commitRef}\` and trigger a redeploy.` },
            confirm: { type: "plain_text", text: "Yes, rollback" },
            deny:    { type: "plain_text", text: "Cancel" },
          },
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌  Reject / Escalate" },
          action_id: "reject_escalate",
          value: inc.id,
        },
      ],
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `DevPulse · View full reasoning → <https://YOUR_DASHBOARD_URL/incidents/${inc.id}|Open dashboard>` },
      ],
    },
  ];
}

// ─── Internal HTTP route: POST /post ─────────────────────────────
// Called by the agent's post_incident_summary tool.
// Body: { incidentId: string }
receiver.app.post("/post", express.json(), async (req, res) => {
  const { incidentId } = req.body;
  if (!incidentId) return res.status(400).json({ error: "incidentId required" });

  try {
    const snap = await db.collection("incidents").doc(incidentId).get();
    if (!snap.exists) return res.status(404).json({ error: "incident not found" });

    const inc = { id: snap.id, ...snap.data() };
    const blocks = buildIncidentBlocks(inc);

    const result = await slack.client.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text:    `[DevPulse] ${inc.title}`,
      blocks,
    });

    // Store the Slack message timestamp so we can update it later
    await db.collection("incidents").doc(incidentId).update({
      slackMessageTs:      result.ts,
      slackMessageChannel: result.channel,
    });

    res.json({ ok: true, ts: result.ts });
  } catch (err) {
    console.error("[slack] post error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Button handlers ─────────────────────────────────────────────
slack.action("approve_rollback", async ({ body, ack, client }) => {
  await ack();
  const incidentId = body.actions[0].value;

  await db.collection("incidents").doc(incidentId).update({
    approvalStatus: "approved",
  });

  // Replace the interactive message with a plain confirmation
  await client.chat.update({
    channel: body.channel.id,
    ts:      body.message.ts,
    text:    "✅ *Rollback approved.* DevPulse is executing the revert and monitoring Dynatrace.",
    blocks:  [],
  });

  console.log(`[slack] rollback approved for ${incidentId}`);
});

slack.action("reject_escalate", async ({ body, ack, client }) => {
  await ack();
  const incidentId = body.actions[0].value;

  await db.collection("incidents").doc(incidentId).update({
    approvalStatus: "rejected",
    status:         "escalated",
  });

  await client.chat.update({
    channel: body.channel.id,
    ts:      body.message.ts,
    text:    "↗️ *Escalated to you.* DevPulse has handed off with full context. Open the dashboard to review.",
    blocks:  [],
  });

  console.log(`[slack] escalated incident ${incidentId}`);
});

// ─── Export Cloud Function ────────────────────────────────────────
exports.slackBridge = onRequest(receiver.app);
