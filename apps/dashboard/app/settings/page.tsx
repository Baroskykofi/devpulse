"use client";
// app/settings/page.tsx — Settings Page
// Shows connection status and configuration reference for the developer.

import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { db } from "@/lib/firestore";
import { collection, getDocs, limit, query } from "firebase/firestore";

type Status = "checking" | "connected" | "error";

function StatusDot({ status }: { status: Status }) {
  const color = status === "connected" ? "var(--green)"
    : status === "error" ? "var(--red)" : "var(--amber)";
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color,
      animation: status === "checking" ? "pulse-dot 1.2s ease-in-out infinite" : "none",
    }} />
  );
}

function ConfigRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const display = masked && !revealed ? "••••••••••••••••" : (value || "not set");
  const isSet = !!value;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "9px 14px", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-dim)", minWidth: 290 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-code)", fontSize: 11,
        color: isSet ? "var(--green)" : "var(--red)",
        flex: 1,
      }}>
        {display}
      </div>
      {masked && value && (
        <button
          onClick={() => setRevealed(r => !r)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-ghost)", fontSize: 11, fontFamily: "var(--font-code)",
          }}
        >
          {revealed ? "hide" : "show"}
        </button>
      )}
      <div style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: isSet ? "var(--green)" : "var(--red)",
      }} />
    </div>
  );
}

export default function SettingsPage() {
  const [firestoreStatus, setFirestoreStatus] = useState<Status>("checking");
  const [firestoreError, setFirestoreError]   = useState<string>("");

  useEffect(() => {
    async function check() {
      try {
        await getDocs(query(collection(db, "incidents"), limit(1)));
        setFirestoreStatus("connected");
      } catch (e: any) {
        setFirestoreStatus("error");
        setFirestoreError(e.message ?? "Unknown error");
      }
    }
    check();
  }, []);

  const env = {
    NEXT_PUBLIC_FIREBASE_API_KEY:      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    NEXT_PUBLIC_FIREBASE_APP_ID:       process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      <TopBar />

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>Settings</div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-ghost)", marginTop: 2 }}>
            Configuration and connection status
          </div>
        </div>

        {/* Connection status */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            connections
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {[
              { label: "Firestore", status: firestoreStatus, detail: firestoreStatus === "error" ? firestoreError : firestoreStatus === "connected" ? "Read/write access confirmed" : "Checking…" },
              { label: "Dashboard (this app)", status: "connected" as Status, detail: "Next.js running" },
            ].map(item => (
              <div key={item.label} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
              }}>
                <StatusDot status={item.status} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 1 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-dim)" }}>
                    {item.detail}
                  </div>
                </div>
                <span style={{
                  fontFamily: "var(--font-code)", fontSize: 10,
                  color: item.status === "connected" ? "var(--green)" : item.status === "error" ? "var(--red)" : "var(--amber)",
                  background: item.status === "connected" ? "var(--green-dim)" : item.status === "error" ? "var(--red-dim)" : "var(--amber-dim)",
                  padding: "2px 7px", borderRadius: 3,
                }}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Firebase env vars */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            environment variables
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {Object.entries(env).map(([k, v]) => (
              <ConfigRow key={k} label={k} value={v} masked={k.includes("KEY") || k.includes("APP_ID")} />
            ))}
          </div>
          <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)", marginTop: 8, paddingLeft: 4 }}>
            Set these in apps/dashboard/.env.local — see .env.local.example
          </div>
        </section>

        {/* Firestore collections */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            firestore collections
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {[
              { path: "incidents/{id}",           purpose: "Root incident document. Written by the webhook receiver. Updated by the agent and the dashboard." },
              { path: "incidents/{id}/steps/{id}", purpose: "Agent reasoning steps. Written by the agent via write_reasoning_step. Append-only. Never updated." },
            ].map(row => (
              <div key={row.path} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--blue)", marginBottom: 3 }}>
                  {row.path}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{row.purpose}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Keyboard shortcuts */}
        <section>
          <div style={{ fontFamily: "var(--font-code)", fontSize: 10, color: "var(--text-ghost)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            keyboard shortcuts
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {[
              ["G then I", "Go to Incidents"],
              ["G then H", "Go to History"],
              ["G then S", "Go to Settings"],
              ["Esc",      "Close modal / Go back"],
            ].map(([key, action]) => (
              <div key={key} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 14px", borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{action}</div>
                <kbd style={{
                  fontFamily: "var(--font-code)", fontSize: 11,
                  background: "var(--bg-input)", border: "1px solid var(--border)",
                  padding: "2px 8px", borderRadius: 4, color: "var(--text-muted)",
                }}>
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
