"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { saveDeckLayout } from "../deck-actions";
import { Info, StatBtn } from "./ui";

const Ctx = createContext(null);
const storeKey = (kind) => `dk-layout-${kind}`;
const readPending = (kind) => { try { const raw = window.localStorage.getItem(storeKey(kind)); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const writePending = (kind, layout) => { try { window.localStorage.setItem(storeKey(kind), JSON.stringify(layout)); } catch {} };
const clearPending = (kind) => { try { window.localStorage.removeItem(storeKey(kind)); } catch {} };

/**
 * The 60/40 split of an admin screen: the table on the left, a board of widgets on the right. Which widgets are on
 * the board, their order and whether the board is open are kept in the account (the same store as the dashboards'
 * boards) and in this browser until the account has them.
 *   widgets: [{ k, g, t, w, info, data }]  — `data` is a description from lib/admin-stats.js
 */
export function DeckShell({ kind, widgets, groups, defaults, sub, initial = null, children }) {
  const [layout, setLayout] = useState({ open: initial?.open ?? true, sel: Array.isArray(initial?.sel) ? initial.sel : null });
  const latest = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const pending = readPending(kind);
    if (pending && typeof pending === "object") setLayout({ open: pending.open ?? true, sel: Array.isArray(pending.sel) ? pending.sel : null });
  }, [kind]);

  const flush = () => {
    clearTimeout(timer.current);
    if (!latest.current) return;
    const next = latest.current;
    latest.current = null;
    saveDeckLayout({ kind, layout: { open: next.open, sel: next.sel, sizes: {} } }).then((r) => { if (r?.ok && !latest.current) clearPending(kind); }).catch(() => null);
  };
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hide); flush(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => {
    setLayout((cur) => {
      const next = { ...cur, ...patch };
      latest.current = next;
      writePending(kind, next);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 300);
      return next;
    });
  };

  const byKey = Object.fromEntries(widgets.map((w) => [w.k, w]));
  const chosen = (layout.sel ?? defaults).filter((k) => byKey[k]);
  const value = { open: layout.open, toggle: () => update({ open: !layout.open }) };

  return (
    <Ctx.Provider value={value}>
      <div className="cb-work cb-tight">
        <div className={`cb-dsplit${layout.open ? "" : " cb-one"}`}>
          <div className="cb-dmain">{children}</div>
          {layout.open && <aside className="cb-dside"><Board widgets={widgets} groups={groups} byKey={byKey} chosen={chosen} defaults={defaults} sub={sub} onSel={(sel) => update({ sel })} /></aside>}
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** The button that hides or shows the board; put it in the table's toolbar. */
export function DeckToggle() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return <StatBtn open={ctx.open} onClick={ctx.toggle} />;
}

function Board({ widgets, groups, byKey, chosen, defaults, sub, onSel }) {
  const [menu, setMenu] = useState(false);
  const [over, setOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const drag = useRef(null);
  const wrap = useRef(null);
  const on = new Set(chosen);

  useEffect(() => {
    if (!menu) return;
    const down = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);

  const toggle = (k) => onSel(on.has(k) ? chosen.filter((x) => x !== k) : [...chosen, k]);
  const group = (gid, v) => {
    const keys = widgets.filter((w) => w.g === gid).map((w) => w.k);
    onSel(v ? [...chosen, ...keys.filter((k) => !on.has(k))] : chosen.filter((k) => !keys.includes(k)));
  };
  const drop = (target) => {
    const from = drag.current;
    drag.current = null;
    setOver(null);
    setDragging(null);
    if (!from || from === target) return;
    const rest = chosen.filter((k) => k !== from);
    rest.splice(rest.indexOf(target), 0, from);
    onSel(rest);
  };
  const move = (k, dir) => {
    const i = chosen.indexOf(k), j = i + dir;
    if (j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    onSel(next);
  };

  return (
    <div className="cb-dk-panel">
      <div className="cb-md-head">
        <div>
          <h3 style={{ margin: 0, font: "700 14px var(--cb-head)" }}>Statistics</h3>
          <p className="cb-mute" style={{ margin: "2px 0 0", fontSize: 12 }}>{sub}</p>
        </div>
        <div className="cb-wm" ref={wrap}>
          <button type="button" className="cb-wm-btn" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            Widgets <span className="cb-wm-count">{chosen.length}</span>
          </button>
          {menu && (
            <div className="cb-wm-pop" role="group" aria-label="Widgets">
              <div className="cb-wm-cols">
                {groups.map(([gid, label]) => {
                  const items = widgets.filter((w) => w.g === gid);
                  const n = items.filter((w) => on.has(w.k)).length;
                  return (
                    <div key={gid} className="cb-wm-group">
                      <button type="button" className="cb-wm-head" aria-pressed={n === items.length} onClick={() => group(gid, n < items.length)}>
                        <span>{label}</span><em>{n}/{items.length}</em>
                      </button>
                      {items.map((w) => (
                        <button key={w.k} type="button" className="cb-wm-item" role="menuitemcheckbox" aria-checked={on.has(w.k)} onClick={() => toggle(w.k)}>
                          <span className={`cb-wm-box${on.has(w.k) ? " cb-on" : ""}`} />
                          <span>{w.t}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="cb-wm-foot">
                <button type="button" onClick={() => onSel(null)}>Reset layout</button>
                <button type="button" onClick={() => onSel([])}>Clear all</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="cb-ig-grid">
        {chosen.map((k) => {
          const w = byKey[k];
          return (
            <div
              key={k}
              className={`cb-ig-card cb-ig-s${w.w ?? 6}${over === k ? " cb-over" : ""}${dragging === k ? " cb-dragging" : ""}`}
              draggable
              onDragStart={(e) => { drag.current = k; setDragging(k); try { e.dataTransfer.setData("text/plain", k); e.dataTransfer.effectAllowed = "move"; } catch {} }}
              onDragOver={(e) => { if (drag.current) { e.preventDefault(); setOver(drag.current !== k ? k : null); } }}
              onDrop={(e) => { e.preventDefault(); drop(k); }}
              onDragEnd={() => { drag.current = null; setOver(null); setDragging(null); }}
            >
              <div className="cb-ig-card-head">
                <span className="cb-ig-grip" title="Drag to move" tabIndex={0} role="img" aria-label={`Move ${w.t}. Arrow keys move it.`} onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(k, -1); } if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(k, 1); } }}>⠿</span>
                <h3>{w.t}</h3>
                {w.info && <Info title={w.t} text={w.info} style={{ marginLeft: 2 }} />}
              </div>
              <WidgetBody data={w.data} />
            </div>
          );
        })}
        {chosen.length === 0 && <div className="cb-ig-empty">No widgets on the board. Open <b>Widgets</b> and tick the ones you want.</div>}
      </div>
    </div>
  );
}

function WidgetBody({ data }) {
  if (!data) return null;
  if (data.type === "note") return <p className="cb-ig-foot">{data.text}</p>;
  if (data.type === "bars") {
    if (!data.rows.length) return <p className="cb-ig-foot">{data.empty}</p>;
    const max = Math.max(...data.rows.map((r) => r.value), 1);
    return (
      <ul className="cb-ig-bars">
        {data.rows.map((r) => (
          <li key={r.label}>
            <span className="cb-ig-bars-label" title={r.label}>{r.label}</span>
            <span className="cb-ig-bars-track"><span style={{ width: `${(r.value / max) * 100}%`, background: data.color }} /></span>
            <span className="cb-ig-bars-text">{r.text}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (data.type === "ring") {
    const total = data.parts.reduce((s, p) => s + p.value, 0) || 1;
    const R = 34, C = 2 * Math.PI * R;
    let off = 0;
    return (
      <div className="cb-ig-ringrow">
        <div className="cb-ig-ring">
          <svg width="90" height="90" viewBox="0 0 90 90">
            {data.parts.map((p) => {
              const len = (p.value / total) * C;
              const el = <circle key={p.label} cx="45" cy="45" r={R} fill="none" stroke={p.color} strokeWidth="13" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 45 45)" />;
              off += len;
              return el;
            })}
          </svg>
          <div className="cb-ig-ring-mid"><b>{data.parts.reduce((s, p) => s + p.value, 0) || 0}</b><span>{data.center}</span></div>
        </div>
        <ul className="cb-ig-legend">
          {data.parts.map((p) => (
            <li key={p.label}><i style={{ background: p.color }} /><span>{p.label}</span><b>{p.value} · {Math.round((p.value / total) * 100)}%</b></li>
          ))}
        </ul>
      </div>
    );
  }
  if (data.type === "stats") {
    return (
      <div className="cb-ig-stats">
        {data.items.map((s) => (
          <div key={s.label} className="cb-ig-stat"><span className="cb-ig-stat-label">{s.label}</span><span className={`cb-ig-stat-value${s.warn ? " cb-is-down" : ""}`}>{s.value}</span></div>
        ))}
      </div>
    );
  }
  if (data.type === "cols") {
    const max = Math.max(...data.values, 1);
    return (
      <div className="cb-ig-cols" style={{ height: 96 }}>
        {data.values.map((v, i) => (
          <div key={i} className="cb-ig-col">
            <span className="cb-ig-col-val">{v}</span>
            <span className="cb-ig-col-bar" style={{ height: Math.max((v / max) * 62, 2), background: "#c94a24", width: "100%", maxWidth: 26, borderRadius: "3px 3px 0 0" }} />
            <span className="cb-ig-col-label">{data.labels[i]}</span>
          </div>
        ))}
      </div>
    );
  }
  if (data.type === "funnel") {
    const max = data.rows[0]?.value || 1;
    return (
      <ul className="cb-ig-funnel">
        {data.rows.map((r) => (
          <li key={r.label}>
            <span className="cb-ig-funnel-bar" style={{ width: `${Math.max((r.value / max) * 100, 12)}%`, background: r.color }}><b>{r.value}</b></span>
            <span className="cb-ig-funnel-label">{r.label}<em>{Math.round((r.value / max) * 100)}%</em></span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}
