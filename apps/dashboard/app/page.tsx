"use client";
// app/page.tsx — Incidents List Page
// Reads the `incidents` Firestore collection in real time.
// Includes: loading skeleton, empty state, error state, replay button.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { subscribeToIncidents, replayIncident, type Incident } from "@/lib/firestore";
import { formatDistanceToNow } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────
function statusColor(status: string) {
  if (status === "active")    return "var(--red)";
  if (status === "escalated") return "var(--amber)";
  return "var(--green)";
}

function severityBadge(severity: string, status: string) {
  if (status === "resolved")   return { label: "RESOLVED",  bg: "var(--green-dim)", color: "var(--green)" };
  if (status === "escalated")  return { label: "ESCALATED", bg: "var(--amber-dim)", color: "var(--amber)" };
  if (severity === "critical") return { label: "CRITICAL",  bg: "var(--red-dim)",   color: "var(--red)" };
  return { label: "WARNING", bg: "var(--amber-dim)", color: "var(--amber)" };
}

function agentState(inc: Incident) {
  if (inc.status === "resolved")           return { label: "closed",       color: "var(--green)" };
  if (inc.status === "escalated")          return { label: "escalated",    color: "var(--amber)" };
  if (inc.approvalStatus === "pending")    return { label: "approval ⏳",  color: "var(--amber)" };
  if (inc.approvalStatus === "approved")   return { label: "executing",    color: "var(--blue)" };
  if (inc.recommendation)                  return { label: "proposed",     color: "var(--purple)" };
  if (inc.hypothesis)                      return { label: "hypothesized", color: "var(--purple)" };
  return { label: "analyzing", color: "var(--blue)" };
}

// ─── Loading skeleton ────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[28, 70, 260, 100, 70, 80].map((w, i) => (
        <td key={i} style={{ padding: "13px 14px" }}>
          <div style={{
            height: 12, width: w, borderRadius: 4,
            background: "var(--border)",
            animation: "skeleton-pulse 1.5s ease-in-out infinite alternate",
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────
function SummaryBar({ incidents }: { incidents: Incident[] }) {
  const active   = incidents.filter(i => i.status === "active").length;
  const critical = incidents.filter(i => i.status === "active" && i.severity === "critical").length;
  const pending  = incidents.filter(i => i.approvalStatus === "pending").length;
  const resolved = incidents.filter(i => i.status === "resolved").length;

  const stats = [
    { label: "active",         value: active,   color: active   ? "var(--red)"   : "var(--text-muted)" },
    { label: "critical",       value: critical, color: critical ? "var(--red)"   : "var(--text-muted)" },
    { label: "need approval",  value: pending,  color: pending  ? "var(--amber)" : "var(--text-muted)" },
    { label: "resolved today", value: resolved, color: "var(--green)" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
      gap: 1, background: "var(--border)",
      borderBottom: "1px solid var(--border)",
    }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: "var(--bg-surface)", padding: "12px 20px", textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3,
          }}>
            {s.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Single incident row ─────────────────────────────────────────
function IncidentRow({ inc, onClick }: { inc: Incident; onClick: () => void }) {
  const badge  = severityBadge(inc.severity, inc.status);
  const agent  = agentState(inc);
  const started = inc.startedAt?.toDate?.();
  const ago    = started ? formatDistanceToNow(started, { addSuffix: true }) : "—";

  return (
    <tr
      onClick={onClick}
      style={{ cursor: "pointer", transition: "background 0.12s", borderTop: "1px solid var(--border)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* Status dot */}
      <td style={{ padding: "12px 16px 12px 20px", width: 28 }}>
        <span style={{
          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: statusColor(inc.status),
          boxShadow: inc.status === "active" && inc.severity === "critical"
            ? `0 0 7px ${statusColor(inc.status)}` : "none",
          animation: inc.status === "active" && inc.severity === "critical"
            ? "pulse-dot 1.8s ease-in-out infinite" : "none",
        }} />
      </td>

      {/* Severity badge */}
      <td style={{ padding: "12px 12px" }}>
        <span style={{
          fontFamily: "var(--font-code)", fontSize: 10, fontWeight: 500,
          padding: "2px 7px", borderRadius: 3,
          background: badge.bg, color: badge.color,
        }}>
          {badge.label}
        </span>
      </td>

      {/* Title + service */}
      <td style={{ padding: "12px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
          {inc.title}
        </div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-dim)" }}>
          {inc.service} · {inc.dynatraceProblemId}
        </div>
      </td>

      {/* Metrics */}
      <td style={{ padding: "12px 12px" }}>
        <div style={{
          fontFamily: "var(--font-code)", fontSize: 12,
          color: inc.metrics?.errorRate > 5 ? "var(--red)" : "var(--text-muted)",
        }}>
          {inc.metrics?.errorRate?.toFixed(1)}% err
        </div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-ghost)" }}>
          p99 {inc.metrics?.p99Latency}ms
        </div>
      </td>

      {/* Agent state */}
      <td style={{ padding: "12px 12px" }}>
        <span style={{
          fontFamily: "var(--font-code)", fontSize: 10,
          color: agent.color, background: `${agent.color}18`,
          padding: "2px 7px", borderRadius: 3,
          border: `1px solid ${agent.color}30`,
        }}>
          {agent.label}
        </span>
      </td>

      {/* Time */}
      <td style={{ padding: "12px 14px", textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-dim)" }}>
          {ago}
        </div>
      </td>

      {/* Chevron */}
      <td style={{ padding: "12px 20px 12px 0", width: 20 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-ghost)" strokeWidth="2" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </td>
    </tr>
  );
}

// ─── Incident table section ───────────────────────────────────────
function IncidentSection({
  label, incidents, onRowClick, dim = false
}: { label: string; incidents: Incident[]; onRowClick: (id: string) => void; dim?: boolean }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{
        fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10,
      }}>
        {label} · {incidents.length}
      </div>
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 10, overflow: "hidden",
        opacity: dim ? 0.65 : 1,
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {incidents.map(inc => (
              <IncidentRow key={inc.id} inc={inc} onClick={() => onRowClick(inc.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Replay modal ────────────────────────────────────────────────
function ReplayModal({
  onClose, onReplay
}: { onClose: () => void; onReplay: (scenario: string) => void }) {
  const [selected, setSelected] = useState("bad-deploy");
  const [running, setRunning]   = useState(false);

  const scenarios = [
    { id: "bad-deploy",    label: "Scenario A — Bad deploy (500 errors)",       desc: "Auth middleware refactor breaks POST /todos. Agent should ROLLBACK." },
    { id: "ext-outage",   label: "Scenario B — External dependency outage",     desc: "Downstream returns 503. Agent should ESCALATE with clear context." },
    { id: "traffic-spike",label: "Scenario C — Traffic spike (high latency)",   desc: "Request volume spikes, p99 jumps to 4s. Agent should ESCALATE + recommend scale-up." },
    { id: "missing-env",  label: "Scenario D — Missing env var after config push", desc: "DB_URL dropped from env. Agent should propose a hotfix PR." },
  ];

  async function handleReplay() {
    setRunning(true);
    await onReplay(selected);
    setRunning(false);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(7,9,15,0.88)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
    }}>
      <div style={{
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "24px 26px", width: 460,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            Replay Incident Scenario
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-dim)",
            cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-ghost)", marginBottom: 14 }}>
          Injects a scripted incident into Firestore and triggers the agent. Use this for demos and recovery.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {scenarios.map(s => (
            <div
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                padding: "10px 12px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${selected === s.id ? "var(--blue)" : "var(--border)"}`,
                background: selected === s.id ? "var(--blue-dim)" : "var(--bg-surface)",
                transition: "all 0.12s",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", marginBottom: 3 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-code)" }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleReplay} disabled={running} style={{
            flex: 1, background: "var(--blue)", color: "#fff",
            border: "none", borderRadius: 7, padding: "9px",
            fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
            cursor: running ? "not-allowed" : "pointer",
            opacity: running ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {running ? "Starting…" : "▶ Run Scenario"}
          </button>
          <button onClick={onClose} style={{
            background: "transparent", color: "var(--text-dim)",
            border: "1px solid var(--border)", borderRadius: 7, padding: "9px 16px",
            fontFamily: "var(--font-display)", fontSize: 13, cursor: "pointer",
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showReplay,setShowReplay]= useState(false);
  const router = useRouter();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeToIncidents((data) => {
        setIncidents(data);
        setLoading(false);
      });
    } catch (e) {
      setError("Could not connect to Firestore. Check your environment variables.");
      setLoading(false);
    }
    return () => unsub?.();
  }, []);

  async function handleReplay(scenario: string) {
    try {
      await replayIncident(scenario);
    } catch {
      // silently handled — incident will appear in the list when Firestore updates
    }
  }

  const active   = incidents.filter(i => i.status !== "resolved");
  const resolved = incidents.filter(i => i.status === "resolved");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      <style>{`
        @keyframes skeleton-pulse {
          from { opacity: 0.4; }
          to   { opacity: 0.9; }
        }
      `}</style>

      <TopBar />
      {!loading && !error && <SummaryBar incidents={incidents} />}

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* Page header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>Incidents</div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-ghost)", marginTop: 2 }}>
              Live from Firestore · updates in real time
            </div>
          </div>
          <button
            onClick={() => setShowReplay(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              color: "var(--text-muted)", borderRadius: 7,
              fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 500,
              padding: "7px 14px", cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--blue)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--blue)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Replay Scenario
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            background: "var(--red-dim)", border: "1px solid var(--red-border)",
            borderRadius: 8, padding: "16px 18px", marginBottom: 24,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="var(--red)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--red)", marginBottom: 3 }}>
                Connection error
              </div>
              <div style={{ fontSize: 12, fontFamily: "var(--font-code)", color: "var(--text-dim)" }}>
                {error}
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[1,2,3].map(i => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && incidents.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "80px 0", gap: 12,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--green-dim)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted)" }}>
              All clear — no incidents
            </div>
            <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-ghost)" }}>
              DevPulse is watching. Go sleep.
            </div>
            <button
              onClick={() => setShowReplay(true)}
              style={{
                marginTop: 8,
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-dim)", borderRadius: 7,
                fontFamily: "var(--font-display)", fontSize: 12,
                padding: "7px 16px", cursor: "pointer",
              }}
            >
              Run a demo scenario →
            </button>
          </div>
        )}

        {/* Active / Escalated */}
        {!loading && !error && active.length > 0 && (
          <IncidentSection
            label="active"
            incidents={active}
            onRowClick={id => router.push(`/incidents/${id}`)}
          />
        )}

        {/* Resolved */}
        {!loading && !error && resolved.length > 0 && (
          <IncidentSection
            label="resolved"
            incidents={resolved}
            onRowClick={id => router.push(`/incidents/${id}`)}
            dim
          />
        )}
      </main>

      {showReplay && (
        <ReplayModal
          onClose={() => setShowReplay(false)}
          onReplay={handleReplay}
        />
      )}
    </div>
  );
}
