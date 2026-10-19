"use client";

import { useState } from "react";

const DOT = { report: "#c2391b", admin: "#c94a24", ok: "#1b8a50", bad: "#c2391b", adv: "#3b6fb0", dev: "#7a4fb0", note: "#8c7f73", sys: "#8c7f73" };
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "now");

/** A timeline of steps; a click on a step opens its details. events: [{ kind, who, text, at, facts: [[label, value]] }]. */
export function History({ events, firstOpen = true }) {
  const [open, setOpen] = useState(() => new Set(firstOpen && events.length ? [0] : []));
  const toggle = (i) => setOpen((cur) => { const next = new Set(cur); next.has(i) ? next.delete(i) : next.add(i); return next; });
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {events.map((e, i) => {
        const on = open.has(i);
        return (
          <li key={i} style={{ position: "relative", padding: "0 0 16px 26px", fontSize: ".84rem", lineHeight: 1.45 }}>
            {i < events.length - 1 && <span style={{ position: "absolute", left: 5, top: 16, bottom: -2, width: 2, background: "var(--line)" }} />}
            <i style={{ position: "absolute", left: 0, top: 3, width: 12, height: 12, borderRadius: "50%", background: DOT[e.kind] ?? DOT.note, boxShadow: "0 0 0 3px #fff" }} />
            <div role="button" tabIndex={0} aria-expanded={on} onClick={() => toggle(i)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(i); } }} style={{ display: "flex", gap: 10, justifyContent: "space-between", cursor: "pointer", borderRadius: 8, margin: "-4px -8px", padding: "4px 8px" }}>
              <span><b>{e.who}</b> · {e.text}<span className="ad-mute" style={{ display: "block" }}>{when(e.at)}</span></span>
              <span aria-hidden="true" style={{ color: "var(--ink-3)", transform: on ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
            </div>
            {on && e.facts?.length > 0 && (
              <dl style={{ margin: "8px 0 2px", padding: "10px 14px", background: "var(--surface)", borderRadius: 10, display: "grid", gap: 8 }}>
                {e.facts.map(([k, v]) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 10, fontSize: ".8125rem" }}><dt style={{ color: "var(--ink-3)", fontWeight: 600 }}>{k}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd></div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
