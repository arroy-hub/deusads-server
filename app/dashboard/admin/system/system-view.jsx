"use client";

import { useState } from "react";
import { Band, Icon, Pill } from "../ui";

const COLS = "140px minmax(0,1fr) 130px 110px";
const nameOf = (r) => r.file.replace(/^\d+_/, "");
const dayOf = (r) => (r.appliedAt ? String(r.appliedAt).slice(0, 10) : "");
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]);

/** The System screen (mockup systemA): status card, three tiles, what needs attention, the latest applied migrations. */
export default function SystemView({ rows, tracked, ahead }) {
  const [all, setAll] = useState(false);
  const missing = rows.filter((r) => r.state === "missing");
  const applied = rows.filter((r) => r.state === "applied");
  const shownApplied = all ? [...applied].reverse() : applied.slice(-5).reverse();
  const ok = applied.length;
  const behind = missing.length > 0 || !tracked;

  const title = !tracked ? "Migrations are not tracked yet" : missing.length ? "The database is behind the code" : "The database is up to date";
  const text = !tracked
    ? "Run 0012_schema_versions.sql in the SQL Editor so every later migration records itself here."
    : missing.length
      ? `${missing.length} migration${missing.length === 1 ? " is" : "s are"} not applied: ${list(missing.map((r) => r.version))}. Features that need ${missing.length === 1 ? "it" : "them"} show errors until they are run.`
      : `All ${rows.length} migrations are applied.`;

  return (
    <>
      <Band title="System" sub="The database against the code you are running." />
      <div className="cb-work">
        <div className={`cb-st${behind ? "" : " cb-ok"}`}>
          <span className="cb-st-ic"><Icon name={behind ? "warn" : "check"} size={24} /></span>
          <div style={{ flex: 1, minWidth: 240 }}><h2>{title}</h2><p>{text}</p></div>
          <div style={{ minWidth: 220, flex: 1, display: "grid", gap: 6 }}>
            <div className="cb-prog" role="img" aria-label={`${ok} of ${rows.length} applied`}><i style={{ width: `${rows.length ? (ok / rows.length) * 100 : 0}%` }} /></div>
            <span className="cb-mute">{ok} of {rows.length} applied</span>
          </div>
        </div>

        <div className="cb-tiles">
          <div className="cb-tile"><span>Applied</span><b>{ok}</b></div>
          <div className={`cb-tile${missing.length ? " cb-bad" : ""}`}><span>Not applied</span><b>{missing.length}</b>{missing.length > 0 && <small>run in the SQL Editor, in order</small>}</div>
          <div className="cb-tile"><span>Unknown to this version</span><b>{ahead.length}</b><small>{ahead.length ? `dashboard is probably behind (${ahead.join(", ")})` : "dashboard is not behind"}</small></div>
        </div>

        {missing.length > 0 && (
          <div>
            <div className="cb-cap" style={{ margin: "4px 0 8px" }}>Needs attention</div>
            <div className="cb-list">
              {missing.map((r) => (
                <div key={r.version} className="cb-lr" style={{ gridTemplateColumns: COLS }}>
                  <code className="cb-mono">{r.version}</code>
                  <div><strong>{nameOf(r)}</strong><div className="cb-mute">{r.summary}</div></div>
                  <span><Pill tone="bad">Not applied</Pill></span>
                  <span className="cb-mute">supabase/migrations</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {applied.length > 0 && (
          <div>
            <div className="cb-cap" style={{ margin: "4px 0 8px" }}>Applied</div>
            <div className="cb-list">
              {shownApplied.map((r) => (
                <div key={r.version} className="cb-lr" style={{ gridTemplateColumns: COLS, minHeight: 48 }}>
                  <code className="cb-mono">{r.version}</code>
                  <div><strong style={{ fontWeight: 600 }}>{nameOf(r)}</strong><div className="cb-mute">{r.summary}</div></div>
                  <span><Pill tone="good">Applied</Pill></span>
                  <span className="cb-mute">{dayOf(r)}</span>
                </div>
              ))}
              {applied.length > 5 && (
                <div style={{ padding: "10px 18px", borderTop: "1px solid var(--line-2)" }}>
                  <button type="button" className="cb-btn cb-q cb-s" onClick={() => setAll((v) => !v)}>{all ? "Show only the latest 5" : `Show all ${ok}`}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
