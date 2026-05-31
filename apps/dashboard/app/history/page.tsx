"use client";
// app/history/page.tsx — Incident History Page
// Shows all resolved and escalated incidents with post-mortem summaries.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { subscribeToIncidents, type Incident } from "@/lib/firestore";
import { formatDistanceToNow, format, differenceInMinutes } from "date-fns";

function duration(inc: Incident): string {
  if (!inc.startedAt?.toDate || !inc.resolvedAt?.toDate) return "—";
  const mins = differenceInMinutes(inc.resolvedAt.toDate(), inc.startedAt.toDate());
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function outcomeLabel(inc: Incident) {
  if (inc.status === "resolved" && inc.approvalStatus === "approved")
    return { label: "auto-resolved",  color: "var(--green)", bg: "var(--green-dim)" };
  if (inc.status === "resolved")
    return { label: "resolved",       color: "var(--green)", bg: "var(--green-dim)" };
  if (inc.status === "escalated")
    return { label: "escalated",      color: "var(--amber)", bg: "var(--amber-dim)" };
  return { label: "open", color: "var(--blue)", bg: "var(--blue-dim)" };
}

function SkeletonRow() {
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      {[200, 80, 200, 80, 80, 120].map((w, i) => (
        <td key={i} style={{ padding: "13px 14px" }}>
          <div style={{
            height: 12, width: w, borderRadius: 4, background: "var(--border)",
            animation: "skeleton-pulse 1.5s ease-in-out infinite alternate",
          }} />
        </td>
      ))}
    </tr>
  );
}

export default function HistoryPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "resolved" | "escalated">("all");
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeToIncidents(data => {
      setIncidents(data.filter(i => i.status !== "active"));
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = incidents.filter(i =>
    filter === "all" ? true : i.status === filter
  );

  const avgResolutionMins = (() => {
    const resolved = incidents.filter(i =>
      i.status === "resolved" && i.startedAt?.toDate && i.resolvedAt?.toDate
    );
    if (!resolved.length) return null;
    const total = resolved.reduce((acc, i) =>
      acc + differenceInMinutes(i.resolvedAt!.toDate(), i.startedAt.toDate()), 0
    );
    return Math.round(total / resolved.length);
  })();

  const autoResolved = incidents.filter(
    i => i.status === "resolved" && i.approvalStatus === "approved"
  ).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      <style>{`
        @keyframes skeleton-pulse {
          from { opacity: 0.4; }
          to   { opacity: 0.9; }
        }
      `}</style>

      <TopBar />

      {/* Stats bar */}
      {!loading && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1, background: "var(--border)",
          borderBottom: "1px solid var(--border)",
        }}>
          {[
            { label: "total incidents", value: incidents.length, color: "var(--text-body)" },
            { label: "auto-resolved",   value: autoResolved,     color: "var(--green)" },
            { label: "escalated",       value: incidents.filter(i => i.status === "escalated").length, color: "var(--amber)" },
            { label: "avg resolution",  value: avgResolutionMins ? `${avgResolutionMins}m` : "—", color: "var(--blue)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--bg-surface)", padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
                textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {/* Header + filter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>Incident History</div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-ghost)", marginTop: 2 }}>
              All resolved and escalated incidents
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "resolved", "escalated"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? "var(--bg-raised)" : "transparent",
                  border: `1px solid ${filter === f ? "var(--border-mid)" : "transparent"}`,
                  color: filter === f ? "var(--text-body)" : "var(--text-dim)",
                  borderRadius: 6, padding: "5px 11px",
                  fontFamily: "var(--font-display)", fontSize: 12, cursor: "pointer",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>{[1,2,3,4].map(i => <SkeletonRow key={i} />)}</tbody>
            </table>
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>No incidents in history yet</div>
            <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-ghost)" }}>
              Resolved incidents will appear here
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Incident", "Service", "Root Cause", "Duration", "Outcome", "Date"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontFamily: "var(--font-code)", fontSize: 10, fontWeight: 500,
                      color: "var(--text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inc => {
                  const outcome = outcomeLabel(inc);
                  const started = inc.startedAt?.toDate?.();
                  return (
                    <tr
                      key={inc.id}
                      onClick={() => router.push(`/incidents/${inc.id}`)}
                      style={{ borderTop: "1px solid var(--border)", cursor: "pointer", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-raised)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
                          {inc.title}
                        </div>
                        <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)" }}>
                          {inc.dynatraceProblemId}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-muted)" }}>
                          {inc.service}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", maxWidth: 200 }}>
                          {inc.hypothesis?.suspect ?? "—"}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "var(--font-code)", fontSize: 12, color: "var(--text-muted)" }}>
                          {duration(inc)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{
                          fontFamily: "var(--font-code)", fontSize: 10, fontWeight: 500,
                          padding: "2px 7px", borderRadius: 3,
                          background: outcome.bg, color: outcome.color,
                        }}>
                          {outcome.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-dim)" }}>
                          {started ? format(started, "MMM d, HH:mm") : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
