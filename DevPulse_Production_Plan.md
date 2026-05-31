# DevPulse Production Plan

DevPulse

The Solo Developer's On-Call Engineer

Production Plan & Build Guide

Hackathon: Building Agents for Real-World Challenges

Track: Dynatrace

Stack: Gemini 3 · Google Cloud Agent Builder · Dynatrace MCP


# 1. Executive Summary

DevPulse is an autonomous incident-response agent built for solo developers and small engineering teams. When a production service degrades, DevPulse performs the first 20 minutes of incident response automatically — pulling observability signals from Dynatrace, correlating them with recent code and deploy activity, forming a hypothesis about the root cause, and proposing a remediation action (rollback, hotfix PR, or escalation) for human approval.

The agent is built on Gemini 3 via Google Cloud Agent Builder, with the Dynatrace MCP server providing observability superpowers and the GitHub API providing version-control superpowers. A lightweight web dashboard and Slack integration form the human-in-the-loop interface.

## 1.1 The Problem

Every solo dev, indie hacker, or two-person startup faces the same reality: when production breaks at 2am, there is no SRE team. The alert is vague ("service degraded"), the logs are noisy, and figuring out which of the last five deploys caused the issue costs precious minutes of downtime. The first 20 minutes of an incident — the triage phase — is the highest-leverage, lowest-creativity work in operations. It is also the work most developers least want to do at 2am.

## 1.2 The Solution

DevPulse replaces those first 20 minutes with an agent loop. Detect → observe → correlate → hypothesize → propose. The human keeps full control: nothing destructive happens without explicit approval through Slack or the dashboard. The agent's reasoning is fully visible — no black boxes.

## 1.3 Why This Wins the Dynatrace Track

- Less crowded bucket: Dynatrace requires real observability understanding, filtering out casual entries.
- Meaningful MCP integration: incident response naturally uses problems, entities, metrics, and logs — not just one endpoint.
- Clear agentic pattern: multi-step reasoning (plan → observe → hypothesize → act) is the textbook agent use case.
- Visible reasoning: judges can see Gemini's chain-of-thought driving real tool calls against live infrastructure.
- Human-in-the-loop is built-in, satisfying the brief's "keeping you in control" requirement.

# 2. Product Specification

## 2.1 Target User

Primary user: a solo developer or small team (2-5 engineers) running production services on cloud infrastructure, without a dedicated SRE or on-call rotation. They use Dynatrace for observability and GitHub for version control. They are technically capable but time-constrained.

## 2.2 Core User Journey


## 2.3 Core Capabilities (MVP)

### Must-have

- Receive Dynatrace problem alerts via webhook.
- Query Dynatrace MCP for: problem details, affected entities, host metrics, log excerpts.
- Query GitHub for: recent commits, recent deploys (via Actions API), open PRs.
- Produce a structured hypothesis: likely cause, confidence (low/medium/high), supporting evidence.
- Recommend one of three actions: rollback, create hotfix PR, escalate to human.
- Post structured summary to Slack with interactive approve/reject buttons.
- Execute the rollback action when approved (revert commit + redeploy).
- Web dashboard showing live incident timeline and agent reasoning trace.
### Nice-to-have (only if time permits)

- Multi-channel alerts (email + Slack + Discord).
- Learning loop: store past incidents and feed them as few-shot examples for future runs.
- Automated post-mortem document generation.
- Cost-impact estimation (downtime cost based on traffic data).
## 2.4 Explicit Non-Goals

Discipline on scope matters more than feature count. DevPulse will NOT:

- Replace Dynatrace or build a custom monitoring system — it consumes Dynatrace signals.
- Act without human approval on destructive operations.
- Support every cloud provider — Google Cloud Run is the demo target.
- Provide a chat interface as the primary UI — agents act, they don't just talk.

# 3. Technical Architecture

## 3.1 System Overview

DevPulse is composed of four logical layers: the monitored target (a demo application), the observability layer (Dynatrace), the agent layer (Google Cloud Agent Builder running a Gemini 3-powered agent with MCP tools), and the human-interface layer (web dashboard and Slack).

## 3.2 Component Breakdown


## 3.3 Data Flow

- Dynatrace OneAgent runs in the demo app's container, streaming metrics and traces.
- When Dynatrace's Davis AI detects a problem, it fires a webhook configured to hit a Cloud Function.
- The Cloud Function creates an Incident record in Firestore and invokes the Agent Builder agent with the problem ID.
- The agent uses the Dynatrace MCP to fetch full problem context, affected entity details, and a slice of recent metrics and logs.
- The agent uses the GitHub tool to list recent commits and deploys touching the affected service.
- Gemini 3 reasons over all collected evidence and produces a structured hypothesis and recommendation.
- The agent writes the reasoning trace to Firestore (so the dashboard can render it live) and posts a summary to Slack.
- On approval, the agent calls the GitHub tool to revert the suspect commit and triggers redeploy.
- The agent polls Dynatrace until the problem closes, then writes a final post-mortem note.
## 3.4 Agent Tools (MCP Function Catalog)



# 4. Agent Reasoning Design

## 4.1 The Reasoning Playbook

The agent follows a structured playbook on every incident. This isn't a strict state machine — Gemini reasons about whether to skip or repeat steps — but it's the default flow encoded in the system prompt.

### Phase 1: Observe

- Pull full problem details from Dynatrace.
- Identify affected entities and their criticality.
- Pull a relevant slice of metrics (CPU, memory, response time, error rate) for the incident window.
- Pull a sample of error logs from the incident window.
### Phase 2: Correlate

- List commits and deploys to the affected service in the 24 hours before the incident.
- Highlight any deploys within 30 minutes of incident start (high suspicion window).
- Diff the suspect commits and look for signals: env vars, config changes, dependency bumps, schema migrations.
### Phase 3: Hypothesize

Gemini produces a structured hypothesis with these fields:

- Primary suspect: one of (recent deploy, dependency outage, infrastructure issue, traffic spike, unknown).
- Confidence: low, medium, or high — with explicit justification.
- Supporting evidence: 2-4 specific data points (e.g., "error rate jumped at 02:14 UTC, commit abc1234 deployed at 02:13 UTC").
- Alternative hypotheses: at least one other plausible explanation, with reasoning for why it's less likely.
### Phase 4: Recommend

Maps the hypothesis to one of three actions:

- ROLLBACK: high-confidence deploy-caused incident. Suggest reverting the suspect commit.
- PR: medium-confidence with an obvious fix (e.g., missing env var). Suggest a hotfix PR.
- ESCALATE: low confidence or non-code cause (infra, dependency). Hand off to human with all gathered context.
### Phase 5: Execute & Verify

- On approval, perform the action.
- Poll Dynatrace every 60 seconds until problem closes or 15 minutes pass.
- If problem persists, return to Phase 3 with the new context (failed action becomes evidence).
- If problem resolves, write a one-paragraph post-mortem summarizing what happened and what fixed it.
## 4.2 System Prompt Skeleton

The agent's system prompt encodes the playbook, the principles, and the constraints. A working skeleton:

You are DevPulse, an autonomous incident-response agent for solo developers.

Your job: when production breaks, perform the first 20 minutes of triage.


PRINCIPLES:

1. Be specific. "Error rate increased" is useless. "Error rate jumped from

0.2% to 14% at 02:14 UTC, coinciding with deploy of commit abc1234" is useful.

2. Always cite evidence. Every claim links to a metric, log line, or commit.

3. Never act destructively without human approval. Rollbacks, deletions, and

force-pushes always go through Slack approval.

4. Show your reasoning. Call write_reasoning_step before and after each tool call.

5. Bias toward action with verification, not toward exhaustive analysis. The user

wants a recommendation in under 2 minutes, not a textbook.


PLAYBOOK: Observe → Correlate → Hypothesize → Recommend → Execute → Verify


OUTPUT FORMAT for the Slack summary:

• Problem: one sentence

• Impact: services and users affected

• Hypothesis: primary cause + confidence + evidence (3 bullets max)

• Recommendation: one action, clearly described

• Approval needed: Y/N

## 4.3 Guardrails

- Hard limit: agent makes at most 15 tool calls per incident. Beyond that, it must summarize and escalate.
- Destructive actions (revert, force-push, delete) always require Slack approval — no exceptions.
- If confidence is below medium on a destructive action, default to ESCALATE.
- All agent reasoning is logged to Firestore. Full transparency is a feature, not a debug tool.

# 5. 14-Day Build Plan

Two weeks is enough time for a focused, polished build — and not enough for scope creep. Each day below has a single deliverable. Resist the temptation to do everything at once.

## Phase 1: Foundation (Days 1-2)

### Day 1 — Demo App & Dynatrace

- Build a minimal Node.js Express app with 3 endpoints: /healthz, /todos (GET/POST), /external (calls a flaky downstream).
- Containerize and deploy to Cloud Run.
- Sign up for Dynatrace SaaS free tier (15-day trial is fine for hackathon timeline).
- Install OneAgent on the Cloud Run service.
- Verify Dynatrace sees traffic and the service appears in the dashboard.
### Day 2 — Triggering Real Incidents

- Add a /chaos endpoint that lets you toggle three failure modes: high latency, 500 errors, memory leak.
- Trigger each failure mode and confirm Dynatrace fires a problem alert.
- Configure Dynatrace problem webhook to hit a placeholder Cloud Function URL.
- End-of-day milestone: you can break the app and see Dynatrace react within 60 seconds.
## Phase 2: Agent Brain (Days 3-5)

### Day 3 — Agent Builder Setup

- Stand up Google Cloud Agent Builder in a new project.
- Wire up Gemini 3 as the reasoning model.
- Write the first draft of the system prompt (use the skeleton from section 4.2).
- Test with a hand-crafted incident payload — verify the agent calls a mock tool.
### Day 4 — Dynatrace MCP Connection

- Connect the Dynatrace MCP server to the agent.
- Test each MCP function manually: get_problem, list_entities, query_metric, fetch_logs.
- Update the system prompt with specific guidance on which tool to use when.
- Trigger a real incident in your demo app — verify the agent can pull the problem details.
### Day 5 — GitHub Tool

- Build the GitHub tool as a thin MCP wrapper (Node or Python, your choice).
- Implement: list_recent_commits, get_commit_diff, revert_commit.
- Wire it into Agent Builder.
- Push a deliberately bad commit to the demo app's repo and verify the agent can find it.
## Phase 3: Reasoning Loop (Days 6-8)

### Day 6 — End-to-End Happy Path

- Connect Dynatrace webhook → Cloud Function → Agent Builder.
- Run a full incident: bad deploy → Dynatrace fires → agent observes → agent correlates → agent forms hypothesis.
- At this point the agent only produces text. No actions yet. That's fine.
- Read the agent's reasoning transcript carefully. Is it specific? Does it cite evidence? Tune the prompt.
### Day 7 — Prompt Engineering Day

This day is intentionally allocated to nothing but improving the reasoning quality. Set up 3-4 scripted incident scenarios and run the agent against each. Read every output. Fix the prompt. Run again. The difference between a good demo and a great demo is usually a day of pure prompt iteration.

- Scenario A: bad deploy causes 500 errors — agent should ROLLBACK with high confidence.
- Scenario B: external dependency returns 503s — agent should ESCALATE with clear context.
- Scenario C: traffic spike causes latency — agent should ESCALATE and recommend scale-up.
- Scenario D: missing env var after config push — agent should propose a PR.
### Day 8 — Action Execution

- Implement the revert_commit action with safety checks.
- Wire up the approval gate: agent posts to Slack, waits for button click.
- Test the full loop: incident → recommendation → human approval → execution → verification.
## Phase 4: Human Interface (Days 9-10)

### Day 9 — Dashboard

- Scaffold a Next.js app deployed on Cloud Run.
- Build an Incidents list page (reading from Firestore).
- Build an Incident Detail page with a live-updating reasoning timeline (Firestore subscriptions).
- Make it look ops-y: dark theme, monospace for log excerpts, clear status badges.
### Day 10 — Slack Integration

- Create a Slack app with bot scopes and interactive components enabled.
- Build the Block Kit message template for incident summaries.
- Wire up the button-click handler: route Approve to the agent's execute step, Reject to a polite "escalating to you" message.
- Test on your phone — the demo will likely include showing the phone.
## Phase 5: Polish & Submit (Days 11-14)

### Day 11 — End-to-End Dogfooding

- Run all four incident scenarios end-to-end with timing.
- Identify and fix the three biggest pain points (anything that takes more than 3 seconds to feel "alive").
- Add loading states, error states, and a manual "replay incident" button for demo recovery.
### Day 12 — Repo & License

- Clean up the repo: README with architecture diagram, setup instructions, env var documentation.
- Add an MIT or Apache 2.0 LICENSE file at the repo root.
- Verify the License shows up in GitHub's About sidebar (this is a submission requirement).
- Make the repo public.
### Day 13 — Demo Video

- Script the video using the structure in section 7.
- Record screen captures of each scene separately for clean editing.
- Record voice-over in a single take per scene.
- Edit, add captions (judges may watch on mute), keep under 3 minutes.
### Day 14 — Submission

- Hosted project URL: confirm Cloud Run service is publicly accessible (with a demo mode).
- Open-source repo URL: confirm it's public with license visible.
- Demo video URL: upload to YouTube as unlisted, confirm playback works.
- Devpost form: select Dynatrace track, fill all fields, submit by mid-day (not the deadline minute).

# 6. Risk Register

These are the most likely things that go wrong. Each has a specific mitigation.



# 7. Demo Video Script

Judges watch dozens of submissions. They form an opinion in the first 20 seconds. The video matters more than first-time hackers expect — possibly as much as the build itself. Treat it as a real production.

## 7.1 Structure (Target: 2:50)


## 7.2 Production Notes

- Record at 1080p minimum. Judges may watch on a desktop, not a phone.
- Add captions. A surprising number of people watch demo videos muted at work.
- Use real timestamps in the demo, not 02:14 UTC three months ago. Authenticity reads.
- Don't show code unless it's the headline. Code on screen looks like documentation; product on screen looks like a product.
- Hard-mute system notifications and Slack pings during recording. Nothing kills a demo faster than a Slack ding mid-explanation.

# 8. Submission Checklist

Cross off each item as you complete it. Do not save these for the final day.

## Required Artifacts

- Hosted project URL (Cloud Run, publicly accessible, with demo mode).
- Open-source repository URL (public on GitHub).
- LICENSE file (MIT or Apache 2.0), visible in repo About sidebar.
- README with: project description, architecture diagram, setup steps, demo instructions.
- Demo video URL (YouTube unlisted, under 3 minutes, captions enabled).
- Devpost submission form completed.
- Track selected: Dynatrace.
## Quality Bar

- Project runs end-to-end without manual intervention beyond the approve button.
- Architecture diagram is clear enough to explain the system in 60 seconds.
- README assumes no prior context — a judge can clone and run with sample env vars.
- Video is captioned and watchable at 1.5x speed without losing the thread.
- Repo has at least three meaningful commits, not one squash.
## Polish

- Custom domain or short URL for the dashboard (optional but classy).
- Screenshots in the README that match what's in the video.
- A short tagline in the Devpost form that names the user and the action: "DevPulse: the on-call engineer for solo developers."

# 9. How Judges Will Score This

Hackathon judges typically score on four to five dimensions. Here's how DevPulse maps to each, with specific things to surface in the demo and README.

## 9.1 Impact / Real-World Relevance

Every solo developer or small startup has had a 2am incident. The user is huge. The pain is universal. Make sure the video opens with this universality, not with technical architecture.

## 9.2 Technical Implementation

Show that the MCP integration is meaningful — not just one call. Surface specific tool sequences ("the agent called Dynatrace four times across two phases") in the video or README. Judges from the partner company will look for this.

## 9.3 Agent-ness

The brief explicitly says "move beyond chat." DevPulse never asks the user to type a query. It receives an event, plans, executes, and reports. That's the agent pattern. Make sure no scene in the demo shows a chat input as the primary UI.

## 9.4 Partner Integration Quality

Dynatrace track judges want to see Dynatrace doing what it does best — detecting and explaining problems via Davis AI — and then the agent building on top of that signal. The agent doesn't replace Dynatrace; it acts on Dynatrace's output. Frame it that way.

## 9.5 Demo Quality

Most submissions fail here. A clean, narrated, captioned video that tells a story will out-score a more technically impressive build with a rambling demo. Budget more time than feels reasonable for the video — it's leverage.


# 10. Appendix: Quick References

## 10.1 Tech Stack at a Glance

- Reasoning model: Gemini 3 (via Google Cloud Agent Builder).
- Agent orchestration: Google Cloud Agent Builder.
- Observability: Dynatrace SaaS + OneAgent.
- Partner integration: Dynatrace MCP Server.
- Code tool: custom GitHub MCP wrapper (Node).
- Frontend: Next.js (App Router) on Cloud Run.
- Messaging: Slack Bolt SDK on Cloud Function.
- State: Firestore (Native mode).
- Demo app: Node.js + Express on Cloud Run.
## 10.2 Repository Layout

devpulse/

├── README.md

├── LICENSE

├── architecture.png

├── apps/

│   ├── demo-api/          # the deliberately-breakable service

│   ├── dashboard/         # Next.js incident UI

│   ├── slack-bridge/      # Cloud Function for Slack events

│   └── webhook-receiver/  # Cloud Function for Dynatrace alerts

├── agent/

│   ├── system-prompt.md   # the playbook

│   ├── tools.json         # tool catalog and schemas

│   └── scenarios/         # scripted test incidents

├── tools/

│   └── github-mcp/        # custom GitHub MCP wrapper

└── infra/

└── deploy.sh          # one-command deploy script

## 10.3 Daily Standup Questions (for self-discipline)

- Did I ship the deliverable named for today's date in the plan?
- Did I add a new feature that wasn't in section 2.3? (If yes, why?)
- Could a judge understand what I built today from looking at the repo?
- Am I on track for a Day 13 submission with one full day of buffer?
## 10.4 The One-Line Pitch

"DevPulse is an autonomous incident-response agent that does the first 20 minutes of on-call triage for solo developers — observing Dynatrace signals, correlating with recent code changes, and proposing a fix for human approval, all in under two minutes."


| Step | Actor | Action |
| --- | --- | --- |
| 1 | Dynatrace | Detects anomaly (latency spike, error rate, failed deploy) and fires webhook. |
| 2 | DevPulse Agent | Receives webhook, initializes incident context, begins observation phase. |
| 3 | Agent → Dynatrace MCP | Pulls problem details, affected entities, related metrics, and recent logs. |
| 4 | Agent → GitHub API | Lists commits and deploys in the past 24 hours for the affected service. |
| 5 | Agent (Gemini 3) | Reasons across all signals, forms a ranked hypothesis with confidence score. |
| 6 | Agent → Slack | Posts incident summary, hypothesis, and recommended action with Approve/Reject buttons. |
| 7 | Developer | Reviews on phone or laptop. Approves, rejects, or asks the agent to dig deeper. |
| 8 | Agent | On approval, executes the action (rollback, PR, scale-up). Reports back when done. |
| 9 | Agent | Monitors Dynatrace until the problem resolves. Closes the incident with a post-mortem note. |


| Component | Technology | Responsibility |
| --- | --- | --- |
| Demo Application | Node.js + Express on Cloud Run | A small REST API (3-4 endpoints) deliberately built so you can break it in interesting ways during the demo. |
| Observability | Dynatrace SaaS (free tier) + OneAgent | Monitors the demo app; detects anomalies; fires problem webhooks to the agent. |
| Agent Runtime | Google Cloud Agent Builder + Gemini 3 | Hosts the agent. Handles reasoning, tool selection, and conversation state. |
| Dynatrace MCP | Dynatrace MCP Server | Gives the agent typed access to problems, entities, metrics, and logs. |
| GitHub Tool | Custom MCP wrapper around GitHub REST API | Lets the agent list commits, view diffs, create PRs, and revert commits. |
| Slack Bridge | Slack Bolt SDK + Cloud Function | Posts incident messages with interactive buttons; routes button events back to the agent. |
| Dashboard | Next.js on Cloud Run | Live incident timeline, agent reasoning trace, and approval interface. |
| State Store | Firestore (free tier) | Persists incidents, agent transcripts, and approval decisions for replay in the dashboard. |


| Tool | Source | Purpose |
| --- | --- | --- |
| get_problem_details | Dynatrace MCP | Full context for a Dynatrace problem ID. |
| get_affected_entities | Dynatrace MCP | Services, hosts, and processes implicated in the problem. |
| query_metrics | Dynatrace MCP | Time-series metrics for a given entity and window. |
| fetch_logs | Dynatrace MCP | Recent log lines from affected entities, with error filtering. |
| list_recent_commits | GitHub tool | Commits in the last N hours on a given repo branch. |
| get_commit_diff | GitHub tool | Unified diff for a specific commit. |
| revert_commit | GitHub tool | Creates a revert commit and pushes it. REQUIRES HUMAN APPROVAL. |
| post_incident_summary | Slack bridge | Sends an interactive Block Kit message with Approve/Reject buttons. |
| write_reasoning_step | Firestore | Appends to the incident's reasoning trace (renders live in the dashboard). |


| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Dynatrace MCP unfamiliarity slows you down | High | Spend half of Day 4 just clicking through each MCP tool manually. Don't write agent code until you understand the tool surface. |
| Agent reasoning is vague or inconsistent | High | Day 7 is dedicated to prompt iteration. Build the four scripted scenarios early so you can measure improvement. |
| Demo breaks live during recording | Medium | Build a deterministic "replay" mode that plays a pre-recorded incident through the system. Use it in the video if needed. |
| Dynatrace free trial expires before submission | Medium | Start the trial on Day 1, not before. Plan to submit by Day 13 to leave buffer. |
| Slack interactive buttons are fiddly | Medium | Use Slack Bolt SDK (handles signing and routing). Fall back to dashboard-only approval if Slack eats more than one day. |
| Scope creep — wanting to add features | Very High | Re-read section 2.4 (Non-Goals) before every coding session. A focused agent beats a sprawling one. |
| Gemini hallucinates tool calls or parameters | Medium | Strong tool schemas with descriptions. Always validate parameters server-side. Reject malformed calls with clear error text the agent can recover from. |
| Cloud Run cold starts ruin demo timing | Low | Set min instances = 1 on the dashboard service for the demo. Cost is trivial for a few weeks. |


| Time | Scene | What to show |
| --- | --- | --- |
| 0:00 – 0:20 | The Hook | Phone buzzing at 2am. A vague "service degraded" alert. Voiceover: "Every solo developer knows this moment. Now imagine you didn't have to wake up to figure it out." |
| 0:20 – 0:50 | The Break | Show your terminal. `git push` a deliberately bad commit. Cut to the demo app erroring. Cut to Dynatrace lighting up red. No narration here — the visuals carry it. |
| 0:50 – 1:20 | Agent Observes | Cut to your dashboard. Reasoning trace streams in: "Pulling problem details from Dynatrace... Affected service: todo-api... Pulling recent commits..." Each step appears as the agent makes the actual tool call. This is the "oh wow" moment. |
| 1:20 – 1:50 | Agent Hypothesizes | The hypothesis panel fills in: primary suspect (commit abc1234, deployed 2 minutes before incident start), confidence (high), evidence (3 specific data points). Recommendation: rollback. |
| 1:50 – 2:20 | Human in the Loop | Cut to phone: Slack notification arrives. Open it. Show the summary on the phone screen. Tap Approve. Cut back to dashboard: agent executing rollback, then verifying. Dynatrace goes green. |
| 2:20 – 2:50 | Why It Matters | Quick montage: architecture diagram on screen, name the stack (Gemini 3, Agent Builder, Dynatrace MCP, GitHub). Close on a single line: "Every small team deserves an SRE. DevPulse is yours." |

