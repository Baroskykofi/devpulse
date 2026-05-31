"use client";
// components/TopBar.tsx
// Shared navigation bar used on every page.

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function TopBar() {
  const [time, setTime] = useState(new Date());
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const nav = [
    { label: "incidents", href: "/" },
    { label: "history",   href: "/history" },
    { label: "settings",  href: "/settings" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 24px",
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border)",
      position: "sticky", top: 0, zIndex: 20,
    }}>
      {/* Logo */}
      <div
        onClick={() => router.push("/")}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: "var(--red)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
            DevPulse
          </div>
          <div style={{ fontSize: 10, fontFamily: "var(--font-code)", color: "var(--text-ghost)" }}>
            on-call engineer
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", gap: 2 }}>
        {nav.map(({ label, href }) => (
          <button
            key={label}
            onClick={() => router.push(href)}
            style={{
              background: isActive(href) ? "var(--bg-input)" : "transparent",
              border: "none", borderRadius: 5,
              color: isActive(href) ? "var(--text-body)" : "var(--text-dim)",
              fontFamily: "var(--font-display)", fontSize: 12,
              padding: "5px 11px", cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Live clock */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-code)", fontSize: 11, color: "var(--green)",
          background: "var(--green-dim)",
          border: "1px solid rgba(62,207,142,0.18)",
          padding: "3px 10px", borderRadius: 20,
        }}>
          <span style={{
            width: 6, height: 6, background: "var(--green)", borderRadius: "50%",
            animation: "pulse-dot 1.8s ease-in-out infinite",
            display: "inline-block",
          }} />
          live
        </div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "var(--text-ghost)" }}>
          {time.toUTCString().slice(17, 25)} UTC
        </div>
      </div>
    </header>
  );
}
