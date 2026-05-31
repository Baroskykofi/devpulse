// tools/github-mcp/index.js
// Custom MCP server wrapping the GitHub REST API.
// Exposes: list_recent_commits, get_commit_diff, revert_commit
// Register this as a tool source in Google Cloud Agent Builder.

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

initializeApp();
const db = getFirestore();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BASE_URL     = "https://api.github.com";

// ─── GitHub API helper ────────────────────────────────────────────
async function github(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── MCP server ───────────────────────────────────────────────────
const server = new McpServer({ name: "github-mcp", version: "1.0.0" });

// ── list_recent_commits ──────────────────────────────────────────
server.tool(
  "list_recent_commits",
  "List commits on a repo branch within the last N hours. Returns sha, message, author, and timestamp. Filter out merge commits.",
  {
    owner:     z.string().describe("GitHub repo owner (username or org)"),
    repo:      z.string().describe("Repository name"),
    branch:    z.string().default("main").describe("Branch name"),
    hoursBack: z.number().default(24).describe("How many hours back to look"),
  },
  async ({ owner, repo, branch, hoursBack }) => {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const commits = await github(`/repos/${owner}/${repo}/commits?sha=${branch}&since=${since}&per_page=20`);

    const filtered = commits
      .filter(c => !c.commit.message.startsWith("Merge"))
      .map(c => ({
        sha:       c.sha.slice(0, 7),
        fullSha:   c.sha,
        message:   c.commit.message.split("\n")[0],
        author:    c.commit.author.name,
        timestamp: c.commit.author.date,
        url:       c.html_url,
      }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ commits: filtered, count: filtered.length }),
      }],
    };
  }
);

// ── get_commit_diff ──────────────────────────────────────────────
server.tool(
  "get_commit_diff",
  "Get the full diff for a specific commit. Returns changed files with patches. Use to look for dangerous changes: env vars, middleware, schemas.",
  {
    owner: z.string(),
    repo:  z.string(),
    sha:   z.string().describe("Full or short commit SHA"),
  },
  async ({ owner, repo, sha }) => {
    const commit = await github(`/repos/${owner}/${repo}/commits/${sha}`);

    const files = commit.files.map(f => ({
      filename: f.filename,
      status:   f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch:     f.patch ?? "(binary or too large to display)",
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sha:     commit.sha.slice(0, 7),
          message: commit.commit.message,
          author:  commit.commit.author.name,
          date:    commit.commit.author.date,
          files,
        }),
      }],
    };
  }
);

// ── revert_commit ────────────────────────────────────────────────
// DESTRUCTIVE — always verify approvalStatus in Firestore before executing.
server.tool(
  "revert_commit",
  "DESTRUCTIVE. Creates a revert commit and pushes it to the branch. ONLY call this after approvalStatus is 'approved' in Firestore for the given incidentId.",
  {
    owner:      z.string(),
    repo:       z.string(),
    sha:        z.string().describe("Commit SHA to revert"),
    branch:     z.string().default("main"),
    incidentId: z.string().describe("Firestore incident ID — used to verify approval"),
  },
  async ({ owner, repo, sha, branch, incidentId }) => {
    // ── Safety gate: verify approval ──
    const snap = await db.collection("incidents").doc(incidentId).get();
    if (!snap.exists) throw new Error(`Incident ${incidentId} not found in Firestore`);
    const { approvalStatus } = snap.data();
    if (approvalStatus !== "approved") {
      throw new Error(
        `Approval required before reverting. Current approvalStatus: "${approvalStatus}". ` +
        `The developer must approve in the dashboard or Slack before this tool can be called.`
      );
    }

    // ── Step 1: get the commit to revert ──
    const target = await github(`/repos/${owner}/${repo}/commits/${sha}`);
    const targetTreeSha   = target.parents[0]?.sha;
    const currentHeadRef  = await github(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    const currentHeadSha  = currentHeadRef.object.sha;

    // ── Step 2: create the revert commit ──
    const revertTree = target.parents[0]
      ? (await github(`/repos/${owner}/${repo}/commits/${target.parents[0].sha}`)).commit.tree.sha
      : target.commit.tree.sha;

    const newCommit = await github(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: {
        message:  `revert: Revert "${target.commit.message.split("\n")[0]}"\n\nDevPulse automated rollback. Incident: ${incidentId}`,
        tree:     revertTree,
        parents:  [currentHeadSha],
      },
    });

    // ── Step 3: update the branch reference ──
    await github(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: { sha: newCommit.sha },
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ok:          true,
          revertSha:   newCommit.sha.slice(0, 7),
          message:     "Revert commit pushed. Cloud Run will pick up the new commit via Cloud Build trigger.",
        }),
      }],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("github-mcp server started");
});
