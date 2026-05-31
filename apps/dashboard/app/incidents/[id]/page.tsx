"use client";
// app/incidents/[id]/page.tsx  —  Incident Detail Page
// Two live Firestore subscriptions:
//   1. incidents/{id}          → header metrics + hypothesis + recommendation + approval status
//   2. incidents/{id}/steps/*  → reasoning trace (streams in as the agent writes steps)

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  subscribeToIncident,
  subscribeToSteps,
  updateApproval,
  type Incident,
  type ReasoningStep,
  type StepPhase,
} from "@/lib/firestore";
import { formatDistanceToNow, format } from "date-fns";

// ─── Phase config ─────────────────────────────────────────────────
const PHASE_META: Record<StepPhase, { label: string; color: string; icon: JSX.Element }> = {
  observe: {
    label: "observe",
    color: "var(--blue)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  correlate: {
    label: "correlate",
    color: "var(--amber)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
        <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
      </svg>
    ),
  },
  hypothesize: {
    label: "hypothesize",
    color: "var(--purple)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
    ),
  },
  recommend: {
    label: "recommend",
    color: "var(--red)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    ),
  },
  execute: {
    label: "execute",
    color: "var(--green)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
  },
  waiting: {
    label: "waiting",
    color: "var(--text-dim)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, danger, warn,
}: { label: string; value: string; sub?: string; danger?: boolean; warn?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
      padding: "12px 18px", textAlign: "center", flex: 1,
    }}>
      <div style={{ fontFamily: "var(--font-code)", fontSize: 10,
        color: "var(--text-ghost)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700,
        color: danger ? "var(--red)" : warn ? "var(--amber)" : "var(--green)",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)", marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function EntityRow({ name, type, healthy }: { name: string; type: string; healthy: boolean }) {
  const iconColor = type === "service" ? "var(--blue)" : type === "host" ? "var(--green)" : "var(--purple)";
  const iconBg    = type === "service" ? "var(--blue-dim)" : type === "host" ? "var(--green-dim)" : "var(--purple-dim)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 8px",
      background: "var(--bg-raised)", border: "1px solid var(--border)",
      borderRadius: 6, marginBottom: 5,
    }}>
      <div style={{ width: 22, height: 22, borderRadius: 4, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={iconColor} strokeWidth="2" strokeLinecap="round">
          {type === "service"
            ? <><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="21"/>
                <line x1="4" y1="21" x2="20" y2="21"/></>
            : type === "host"
            ? <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>
            : <><rect x="3" y="3" width="18" height="18" rx="2"/></>}
        </svg>
      </div>
      <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-muted)", flex: 1,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </div>
      <div style={{ width: 6, height: 6, borderRadius: "50%",
        background: healthy ? "var(--green)" : "var(--red)", flexShrink: 0 }} />
    </div>
  );
}

function ToolCallLine({ name, result }: { name: string; result: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-code)", fontSize: 11,
      color: "var(--blue)",
      background: "var(--blue-dim)", border: "1px solid var(--blue-border)",
      padding: "4px 9px", borderRadius: 4, margin: "5px 0",
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
      {name}
      <span style={{ color: "var(--green)", marginLeft: 4 }}>→ {result}</span>
    </div>
  );
}

function LogBlock({ lines }: { lines: string[] }) {
  return (
    <div style={{
      fontFamily: "var(--font-code)", fontSize: 10,
      color: "var(--text-dim)",
      background: "#0a0d14",
      border: "1px solid #161c2a",
      borderRadius: 4, padding: "7px 9px",
      margin: "7px 0", lineHeight: 1.75,
      overflowX: "auto",
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          color: line.includes("ERROR") ? "var(--red)"
               : line.includes("WARN")  ? "var(--amber)"
               : line.includes("INFO")  ? "var(--text-dim)"
               : "var(--text-ghost)",
        }}>
          {line}
        </div>
      ))}
    </div>
  );
}

function ReasoningStepCard({ step, isLast }: { step: ReasoningStep; isLast: boolean }) {
  const meta   = PHASE_META[step.phase] ?? PHASE_META.observe;
  const stepBg = isLast ? "var(--bg-raised)" : "var(--bg-raised)";

  return (
    <div style={{
      display: "flex", gap: 12, marginBottom: 4,
      animation: "step-in 0.25s ease forwards",
    }}>
      {/* Left rail */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%",
          background: `${meta.color}18`,
          color: meta.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, zIndex: 1,
        }}>
          {meta.icon}
        </div>
        {!isLast && (
          <div style={{ flex: 1, width: 1, background: "var(--border)", margin: "2px 0" }} />
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-dim)" }}>
            phase · {meta.label}
          </span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)" }}>
            {step.createdAt?.toDate ? format(step.createdAt.toDate(), "HH:mm:ss") : ""}
          </span>
        </div>

        <div style={{
          background: stepBg,
          border: `1px solid ${isLast ? `${meta.color}30` : "var(--border)"}`,
          borderRadius: 7, padding: "10px 12px",
          fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65,
        }}>
          <p style={{ marginBottom: step.toolCalls?.length || step.logLines?.length ? 6 : 0 }}>
            {step.content}
            {isLast && step.phase === "waiting" && (
              <span style={{
                display: "inline-block", width: 6, height: 12,
                background: "var(--blue)", borderRadius: 1,
                verticalAlign: "text-bottom", marginLeft: 2,
                animation: "blink 1s step-end infinite",
              }} />
            )}
          </p>

          {step.toolCalls?.map((tc, i) => (
            <ToolCallLine key={i} name={tc.name} result={tc.result} />
          ))}

          {step.logLines && step.logLines.length > 0 && (
            <LogBlock lines={step.logLines} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export default function IncidentDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [steps,    setSteps]    = useState<ReasoningStep[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [approving, setApproving] = useState(false);
  const [showConfirm, setShowConfirm] = useState<"approved" | "rejected" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline as new steps arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps.length]);

  useEffect(() => {
    const u1 = subscribeToIncident(id, (inc) => {
      setIncident(inc);
      setLoading(false);
    });
    const u2 = subscribeToSteps(id, setSteps);
    return () => { u1(); u2(); };
  }, [id]);

  async function handleApproval(decision: "approved" | "rejected") {
    setApproving(true);
    await updateApproval(id, decision);
    setApproving(false);
    setShowConfirm(decision);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-code)", fontSize: 12, color: "var(--text-ghost)" }}>
      connecting to firestore…
    </div>
  );

  if (!incident) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-code)", fontSize: 12, color: "var(--text-ghost)" }}>
      incident not found
    </div>
  );

  const severityColor = incident.severity === "critical" ? "var(--red)" : "var(--amber)";
  const started = incident.startedAt?.toDate?.();
  const ago     = started ? formatDistanceToNow(started, { addSuffix: true }) : "";
  const startTs = started ? format(started, "HH:mm:ss 'UTC'") : "";

  const pendingApproval = incident.approvalStatus === "pending";
  const approved        = incident.approvalStatus === "approved";
  const rejected        = incident.approvalStatus === "rejected";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>

      {/* ── Top bar ── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 24px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <button onClick={() => router.push("/")} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-display)", fontSize: 12, padding: "4px 8px",
          borderRadius: 5, transition: "color 0.15s",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          incidents
        </button>

        <span style={{ color: "var(--text-ghost)", fontSize: 12 }}>/</span>

        <div style={{ fontFamily: "var(--font-code)", fontSize: 12, color: "var(--text-muted)" }}>
          {id}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {incident.status === "active" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: "var(--font-code)", fontSize: 11, color: "var(--green)",
              background: "var(--green-dim)", border: "1px solid rgba(62,207,142,0.18)",
              padding: "3px 10px", borderRadius: 20,
            }}>
              <span style={{ width: 5, height: 5, background: "var(--green)", borderRadius: "50%",
                animation: "pulse-dot 1.8s ease-in-out infinite" }} />
              live
            </div>
          )}
          {incident.status === "resolved" && (
            <span style={{ fontFamily: "var(--font-code)", fontSize: 11,
              color: "var(--green)", background: "var(--green-dim)",
              padding: "3px 10px", borderRadius: 20 }}>
              resolved
            </span>
          )}
        </div>
      </header>

      {/* ── Incident header ── */}
      <div style={{ background: "#0e1120", borderBottom: "1px solid var(--border)", padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{
            fontFamily: "var(--font-code)", fontSize: 10, fontWeight: 600,
            padding: "3px 8px", borderRadius: 3,
            background: `${severityColor}18`, color: severityColor,
          }}>
            {incident.severity.toUpperCase()}
          </span>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {incident.title}
          </h1>
          <span style={{
            fontFamily: "var(--font-code)", fontSize: 11,
            color: "var(--text-ghost)", background: "var(--bg-input)",
            padding: "2px 8px", borderRadius: 4, marginLeft: 4,
          }}>
            {incident.dynatraceProblemId}
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { icon: "clock",  val: startTs },
            { icon: "git",    val: `${incident.service} · main` },
            { icon: "server", val: "us-central1" },
            { icon: "time",   val: ago },
          ].map(({ icon, val }) => (
            <div key={val} style={{ display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, color: "var(--text-muted)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round">
                {icon === "clock"  && <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
                {icon === "git"    && <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>}
                {icon === "server" && <><rect x="2" y="2" width="20" height="8" rx="2"/>
                  <rect x="2" y="14" width="20" height="8" rx="2"/>
                  <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>}
                {icon === "time"   && <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12"/></>}
              </svg>
              <span>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Metrics bar ── */}
      <div style={{ display: "flex", background: "#0e1120",
        borderBottom: "1px solid var(--border)" }}>
        <MetricCard label="error rate"   value={`${incident.metrics?.errorRate?.toFixed(1)}%`}
          sub={`↑ from baseline`} danger={incident.metrics?.errorRate > 5} />
        <MetricCard label="p99 latency"  value={`${incident.metrics?.p99Latency}ms`}
          sub="↑ elevated" warn={incident.metrics?.p99Latency > 500} />
        <MetricCard label="req / min"    value={`${incident.metrics?.requestsPerMin}`} sub="nominal" />
        <MetricCard label="instances"    value={`${incident.metrics?.instanceCount}`} sub="healthy" />
      </div>

      {/* ── Body: timeline + right panel ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Timeline */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-code)", fontSize: 10,
            color: "var(--text-ghost)", textTransform: "uppercase",
            letterSpacing: "0.1em", marginBottom: 14 }}>
            agent reasoning trace
          </div>

          {steps.length === 0 && (
            <div style={{ fontFamily: "var(--font-code)", fontSize: 11,
              color: "var(--text-ghost)", paddingTop: 20 }}>
              waiting for agent to begin…
            </div>
          )}

          {steps.map((step, i) => (
            <ReasoningStepCard
              key={step.id}
              step={step}
              isLast={i === steps.length - 1}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Right panel */}
        <div style={{
          width: 240, minWidth: 240,
          background: "var(--bg-surface)", borderLeft: "1px solid var(--border)",
          padding: "14px", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 14,
        }}>

          {/* Recommendation card */}
          {incident.recommendation && (
            <div style={{
              background: "#0e1422",
              border: `1px solid ${incident.recommendation.action === "ROLLBACK" ? "var(--red-border)" : "var(--blue-border)"}`,
              borderRadius: 8, padding: 12,
            }}>
              <div style={{
                fontFamily: "var(--font-code)", fontSize: 10,
                color: incident.recommendation.action === "ROLLBACK" ? "var(--red)" : "var(--blue)",
                letterSpacing: "0.1em", textTransform: "uppercase",
                marginBottom: 7, display: "flex", alignItems: "center", gap: 5,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                recommendation
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                {incident.recommendation.action}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 10 }}>
                {incident.recommendation.description}
              </div>
              {incident.recommendation.commitRef && (
                <div style={{
                  fontFamily: "var(--font-code)", fontSize: 10,
                  color: "var(--blue)", background: "var(--blue-dim)",
                  padding: "3px 7px", borderRadius: 3,
                  display: "inline-block", marginBottom: 10,
                }}>
                  {incident.recommendation.commitRef}
                </div>
              )}

              {/* Approval buttons */}
              {pendingApproval && !approved && !rejected && (
                <>
                  <button
                    disabled={approving}
                    onClick={() => handleApproval("approved")}
                    style={{
                      width: "100%", background: "var(--red)", color: "#fff",
                      border: "none", borderRadius: 6, padding: "8px",
                      fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600,
                      cursor: approving ? "not-allowed" : "pointer",
                      marginBottom: 5, opacity: approving ? 0.6 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Approve
                  </button>
                  <button
                    disabled={approving}
                    onClick={() => handleApproval("rejected")}
                    style={{
                      width: "100%", background: "transparent", color: "var(--text-dim)",
                      border: "1px solid var(--border)", borderRadius: 6, padding: "7px",
                      fontFamily: "var(--font-display)", fontSize: 12,
                      cursor: approving ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Reject / Escalate
                  </button>
                </>
              )}

              {approved && (
                <div style={{ fontFamily: "var(--font-code)", fontSize: 11,
                  color: "var(--green)", padding: "7px 0", textAlign: "center" }}>
                  ✓ approved — executing
                </div>
              )}
              {rejected && (
                <div style={{ fontFamily: "var(--font-code)", fontSize: 11,
                  color: "var(--amber)", padding: "7px 0", textAlign: "center" }}>
                  → escalated to you
                </div>
              )}
            </div>
          )}

          {/* Hypothesis summary */}
          {incident.hypothesis && (
            <>
              <div style={{ height: 1, background: "var(--border)" }} />
              <div>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 10,
                  color: "var(--text-ghost)", textTransform: "uppercase",
                  letterSpacing: "0.1em", marginBottom: 8 }}>
                  hypothesis
                </div>

                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                  {incident.hypothesis.suspect}
                </div>

                {/* Confidence */}
                <div style={{ marginBottom: 10 }}>
                  {(["high", "medium", "low"] as const).map((lvl) => (
                    <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 6,
                      marginBottom: 3 }}>
                      <div style={{ height: 4, flex: 1, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          background: lvl === "high" ? "var(--red)" : lvl === "medium" ? "var(--amber)" : "var(--text-ghost)",
                          width: incident.hypothesis!.confidence === lvl ? "100%"
                               : incident.hypothesis!.confidence === "high" && lvl === "medium" ? "0%" : "0%",
                          opacity: incident.hypothesis!.confidence === lvl ? 1 : 0,
                        }} />
                      </div>
                      <span style={{
                        fontFamily: "var(--font-code)", fontSize: 9,
                        color: incident.hypothesis!.confidence === lvl
                          ? (lvl === "high" ? "var(--red)" : lvl === "medium" ? "var(--amber)" : "var(--text-dim)")
                          : "var(--text-ghost)",
                        minWidth: 40,
                      }}>
                        {lvl}{incident.hypothesis!.confidence === lvl ? " ←" : ""}
                      </span>
                    </div>
                  ))}
                </div>

                <ul style={{ listStyle: "none" }}>
                  {incident.hypothesis.evidence.map((e, i) => (
                    <li key={i} style={{
                      fontSize: 10, fontFamily: "var(--font-code)", color: "var(--text-dim)",
                      marginBottom: 3, paddingLeft: 12, position: "relative", lineHeight: 1.5,
                    }}>
                      <span style={{ position: "absolute", left: 0, color: "var(--text-ghost)" }}>→</span>
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Affected entities */}
          {incident.affectedEntities?.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--border)" }} />
              <div>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 10,
                  color: "var(--text-ghost)", textTransform: "uppercase",
                  letterSpacing: "0.1em", marginBottom: 8 }}>
                  affected entities
                </div>
                {incident.affectedEntities.map((e) => (
                  <EntityRow key={e.name} name={e.name} type={e.type} healthy={e.healthy} />
                ))}
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Approval confirmation modal ── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(7,9,15,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "24px 26px", width: 300, textAlign: "center",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
              background: showConfirm === "approved" ? "var(--green-dim)" : "var(--amber-dim)",
              color: showConfirm === "approved" ? "var(--green)" : "var(--amber)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>
              {showConfirm === "approved"
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
              }
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
              {showConfirm === "approved" ? "Rollback approved" : "Escalated to you"}
            </div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-dim)",
              lineHeight: 1.55, marginBottom: 16 }}>
              {showConfirm === "approved"
                ? "Agent is executing the revert. Monitoring Dynatrace until the problem closes."
                : "Agent has handed off with full context. Review the reasoning trace above."}
            </div>
            <button onClick={() => setShowConfirm(null)} style={{
              background: "var(--border)", border: "none", color: "var(--text-body)",
              fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 500,
              padding: "7px 22px", borderRadius: 6, cursor: "pointer",
            }}>
              dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
