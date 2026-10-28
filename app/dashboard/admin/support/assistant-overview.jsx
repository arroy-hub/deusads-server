"use client";

// The Overview of the assistant's profile (admin → Support → Assistant), laid out as in support-mockup.html:
// a plate with the period and five figures, "Activity by person" on the left, and a column of widgets on the right.

import { useEffect, useRef, useState } from "react";
import { Info } from "../../metrics-deck";

export const PERIODS = [["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"]];
const OUTCOME = { answered: ["Answered", "ok"], escalated: ["Passed to you", "brand"], clarified: ["Asked to clarify", "info"], grouped: ["Grouped with similar", "info"], drafted: ["Drafted a reply for you", "warn"] };
const SORTS = [["need", "Waiting for you first"], ["recent", "Most recent"], ["count", "Most conversations"]];

const THUMB = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>;
const CROSS = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>;
const CHEV = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
const DROP = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

const sameDay = (a, b) => a.toDateString() === b.toDateString();
/** "12:34" today, "27 Oct" before. */
export const when = (iso) => {
  const d = new Date(iso);
  return sameDay(d, new Date()) ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const waitLabel = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const share = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/** The dropdown of the mockup: a pill button with the chosen value, and a menu under it. */
function Drop({ label, value, options, onChange, withAll = false }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const list = withAll ? [["all", "All"], ...options] : options;
  const chosen = withAll && value === "all" ? "" : (list.find((o) => o[0] === value) ?? [, ""])[1];
  return (
    <div className="sb-drop" ref={box}>
      <button type="button" className={`fl-btn${withAll && chosen ? " is-on" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}{chosen && <em>{chosen}</em>}{DROP}
      </button>
      {open && (
        <div className="sb-menu" role="menu">
          {list.map(([key, text]) => (
            <button key={key} type="button" role="menuitemradio" className="fl-opt" aria-checked={value === key} aria-pressed={value === key} onClick={() => { onChange(key); setOpen(false); }}>{text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Stacked bars for the last 14 days: answered by the assistant (blue), passed to a person (red) on top. */
function DailyChart({ days }) {
  const W = 420, H = 130, bw = 22, n = Math.max(1, days.length);
  const gap = n > 1 ? (W - n * bw) / (n - 1) : 0;
  const max = Math.max(10, ...days.map((d) => d.answered + d.passed)) * 1.08;
  const label = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label="Answered by the assistant and passed to you, last 14 days">
      {days.map((d, i) => {
        const x = i * (bw + gap), ha = (d.answered / max) * H, hp = (d.passed / max) * H;
        return (
          <g key={d.day} className="sb-day">
            <title>{`${label(d.day)}\nAnswered by the assistant: ${d.answered}\nPassed to you: ${d.passed}`}</title>
            <rect className="sb-day-hit" x={(x - gap / 2).toFixed(1)} y="0" width={(bw + gap).toFixed(1)} height={H} />
            {ha > 0 && <rect x={x.toFixed(1)} y={(H - ha).toFixed(1)} width={bw} height={ha.toFixed(1)} rx="3" fill="#3b6fb5" />}
            {hp > 0 && <rect x={x.toFixed(1)} y={(H - ha - hp - (ha > 0 ? 1.5 : 0)).toFixed(1)} width={bw} height={hp.toFixed(1)} rx="3" fill="#c94a24" />}
          </g>
        );
      })}
      <text x="0" y={H + 14} fontSize="10.5" fill="#8c7f73">{days[0] ? label(days[0].day) : ""}</text>
      <text x={W} y={H + 14} fontSize="10.5" fill="#8c7f73" textAnchor="end">Today</text>
    </svg>
  );
}

function PersonRow({ p, open, onToggle }) {
  const answered = p.items.filter((i) => i.outcome === "answered").length;
  const passed = p.items.filter((i) => i.outcome === "escalated").length;
  return (
    <div className="sb-uwrap">
      <div className={`sb-urow${open ? " is-open" : ""}`} role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
        <span className="sb-uini" aria-hidden="true">{initials(p.name)}</span>
        <div className="sb-umain"><b>{p.name}</b><small>{p.role ? `${p.role} · ` : ""}{p.items.length} {p.items.length === 1 ? "conversation" : "conversations"} · last {when(p.lastAt)}</small></div>
        <span className="sb-ucnt">
          {answered > 0 && <span className="pill ok">{answered} answered</span>}
          {passed > 0 && <span className="pill brand">{passed} passed to you</span>}
        </span>
        <span className={`sb-uwait${p.waitHours > 0 ? " is-late" : ""}`} title={p.waitHours > 0 ? "Has a question passed to you" : undefined}>{p.waitHours > 0 ? waitLabel(p.waitHours) : ""}</span>
        <span className="sb-uchev">{CHEV}</span>
      </div>
      {open && (
        <div className="sb-ukids">
          <table className="sb-logt"><tbody>
            {p.items.map((r) => {
              const [label, tone] = OUTCOME[r.outcome] ?? [r.outcome, "info"];
              const src = r.outcome === "answered" ? `${r.source || "—"} · ${r.confidence ?? 0}%` : (r.reason || "—");
              return (
                <tr key={r.id}>
                  <td>{when(r.at)}</td>
                  <td><span className="sb-lq" title={r.question}>{r.question}</span></td>
                  <td><span className={`pill ${tone}`}>{label}</span></td>
                  <td><span className="sb-lsrc" title={src}>{src}</span></td>
                  <td>{r.rating === "up" ? <span className="sb-rt is-up" title="Helpful">{THUMB}</span> : r.rating === "down" ? <span className="sb-rt is-dn" title="Not helpful">{CROSS}</span> : <span className="sb-dash">—</span>}</td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

export default function AssistantOverview({ data, period, onPeriod }) {
  const [outcome, setOutcome] = useState("all");
  const [order, setOrder] = useState("need");
  const [open, setOpen] = useState(() => new Set());
  const s = data.stats;

  const people = data.people
    .filter((p) => outcome === "all" || p.items.some((i) => i.outcome === outcome))
    .map((p) => ({ ...p, items: outcome === "all" ? p.items : p.items.filter((i) => i.outcome === outcome) }))
    .sort((a, b) => {
      if (order === "count") return b.items.length - a.items.length || (a.lastAt < b.lastAt ? 1 : -1);
      if (order === "recent") return a.lastAt < b.lastAt ? 1 : -1;
      return (b.waitHours > 0) - (a.waitHours > 0) || b.waitHours - a.waitHours || (a.lastAt < b.lastAt ? 1 : -1);
    });
  const toggle = (key) => setOpen((set) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const helpful = s.rated ? s.helpfulPct : 0;

  return (
    <>
      <div className="cx-plate">
        <Drop label="Period" value={period} options={PERIODS} onChange={onPeriod} />
        <div className="sb-mini">
          <span><b>{s.total}</b>conversations</span>
          <span><b>{s.solvedPct}%</b>solved without you</span>
          <span><b>{s.passed}</b>passed to you</span>
          <span><b>—</b>first answer</span>
          <span><b>{s.rated ? `${s.helpfulPct}%` : "—"}</b>rated helpful</span>
        </div>
      </div>

      <div className="sb-grid">
        <div className="sb-wd sb-act">
          <h2>Activity by person <Info text="Conversations the assistant had, grouped by person. People who are waiting for you are at the top. Click a person to see their conversations." /></h2>
          <small>What it answered, what it passed to you and what it prepared</small>
          <div className="sb-tools">
            <Drop label="Outcome" value={outcome} options={Object.entries(OUTCOME).map(([k, v]) => [k, v[0]])} onChange={setOutcome} withAll />
            <Drop label="Sort" value={order} options={SORTS} onChange={setOrder} />
          </div>
          {people.length === 0
            ? <div className="sb-none">No conversations in this period yet.</div>
            : people.map((p) => <PersonRow key={p.key} p={p} open={open.has(p.key)} onToggle={() => toggle(p.key)} />)}
        </div>

        <div className="sb-col">
          <div className="sb-wd">
            <h2>Answered vs passed to you</h2>
            <small>Last 14 days</small>
            <div className="sb-legend"><span><i style={{ background: "#3b6fb5" }} />Answered by the assistant</span><span><i style={{ background: "#c94a24" }} />Passed to you</span></div>
            <div className="sb-chart"><DailyChart days={data.daily} /></div>
          </div>

          <div className="sb-wd">
            <h2>Why it passed to you</h2>
            <small>Share of handed-over conversations</small>
            {data.reasons.length === 0 ? <div className="sb-none">Nothing passed to you in this period.</div> : (
              <div className="sb-bars">
                {data.reasons.map((r) => { const pct = share(r.count, s.passed); return <div key={r.reason}><span>{r.reason}</span><i style={{ "--w": `${Math.min(100, pct * 2)}%` }} /><em>{pct}%</em></div>; })}
              </div>
            )}
          </div>

          <div className="sb-wd">
            <h2>How users rate it</h2>
            <small>Answers with a rating: {s.ratedShare ?? 0}% of all</small>
            <div className="sb-pad">
              <div className="sb-rbar"><i style={{ width: `${helpful}%` }} /></div>
              <div className="sb-rleg"><span className="sb-rt is-up">{THUMB}</span><b>{s.rated ? `${helpful}%` : "—"}</b> helpful<span className="sb-grow" /><span className="sb-rt is-dn">{CROSS}</span><b>{s.rated ? `${100 - helpful}%` : "—"}</b> not helpful</div>
            </div>
          </div>

          <div className="sb-wd">
            <h2>What people ask about</h2>
            <small>Share of conversations</small>
            {data.topics.length === 0 ? <div className="sb-none">No conversations yet.</div> : (
              <div className="sb-bars">
                {data.topics.map((t) => { const pct = share(t.count, s.total); return <div key={t.topic}><span>{t.topic}</span><i style={{ "--w": `${Math.min(100, pct * 3)}%` }} /><em>{pct}%</em></div>; })}
              </div>
            )}
          </div>

          <div className="sb-wd">
            <h2>Usage <Info text="Tokens processed by the model in this period. A global daily cap stops the assistant if it is reached." /></h2>
            <small>Conversations, people and tokens</small>
            <div className="sb-usage"><div><b>{s.total}</b><small>conversations</small></div><div><b>{s.people ?? 0}</b><small>people</small></div><div><b>{(s.tokens / 1000).toFixed(1)}k</b><small>tokens</small></div></div>
          </div>
        </div>
      </div>
    </>
  );
}
