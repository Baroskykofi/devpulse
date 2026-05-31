// apps/demo-api/index.js
// The deliberately-breakable demo service.
// Dynatrace OneAgent monitors this container.
// Endpoints: /healthz, /todos (GET/POST), /external, /chaos

const express = require("express");
const app = express();
app.use(express.json());

// ─── In-memory state ──────────────────────────────────────────────
let todos = [
  { id: 1, text: "Ship DevPulse", done: false },
  { id: 2, text: "Win the hackathon", done: false },
];
let nextId = 3;

// Chaos state — toggled by POST /chaos
const chaos = {
  mode: "off", // "off" | "errors" | "latency" | "memory"
};

// Memory leak handles
let memoryLeakInterval = null;
const leakedBuffers = [];

// ─── Chaos middleware ─────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === "/healthz" || req.path === "/chaos") return next(); // never chaos these

  if (chaos.mode === "latency") {
    const delay = 3000 + Math.random() * 2000; // 3-5s
    return setTimeout(next, delay);
  }
  next();
});

// ─── /healthz ────────────────────────────────────────────────────
app.get("/healthz", (req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// ─── /todos GET ───────────────────────────────────────────────────
app.get("/todos", (req, res) => {
  res.json({ todos, count: todos.length });
});

// ─── /todos POST ──────────────────────────────────────────────────
// This is the failure target for chaos mode "errors":
// the req.user.userId access will throw a TypeError once the middleware is removed.
app.post("/todos", (req, res) => {
  if (chaos.mode === "errors") {
    // Simulate missing req.user (e.g. auth middleware refactor removed it)
    const userId = req.user.userId; // TypeError: Cannot read properties of undefined
    // ^^^ This line throws — Dynatrace will detect the 500s
  }

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const todo = { id: nextId++, text, done: false };
  todos.push(todo);
  res.status(201).json(todo);
});

// ─── /external ───────────────────────────────────────────────────
// Calls a deliberately flaky downstream URL (used for Scenario B).
app.get("/external", async (req, res) => {
  try {
    // Replace with a real flaky service URL or mock one
    const response = await fetch("https://httpstat.us/503?sleep=500");
    const text = await response.text();
    res.json({ upstream: response.status, body: text });
  } catch (err) {
    res.status(502).json({ error: "upstream failed", detail: err.message });
  }
});

// ─── /chaos ──────────────────────────────────────────────────────
// Toggle failure modes. Used to trigger incidents deterministically.
// Body: { mode: "errors" | "latency" | "memory" | "off" }
app.post("/chaos", (req, res) => {
  const { mode } = req.body;
  const validModes = ["off", "errors", "latency", "memory"];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${validModes.join(", ")}` });
  }

  // Stop memory leak if switching away
  if (chaos.mode === "memory" && mode !== "memory") {
    clearInterval(memoryLeakInterval);
    memoryLeakInterval = null;
    leakedBuffers.length = 0;
  }

  chaos.mode = mode;

  // Start memory leak
  if (mode === "memory") {
    memoryLeakInterval = setInterval(() => {
      leakedBuffers.push(Buffer.alloc(1024 * 1024 * 5)); // 5MB every 2s
    }, 2000);
  }

  console.log(`[chaos] mode set to: ${mode}`);
  res.json({ mode, active: mode !== "off" });
});

// ─── Global error handler ─────────────────────────────────────────
// Catches the TypeError from chaos mode "errors" and returns 500.
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path} — ${err.message}`);
  res.status(500).json({ error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`demo-api listening on :${PORT}`);
});
