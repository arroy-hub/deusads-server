"use client";

import { useState, useRef, useLayoutEffect, useEffect, cloneElement } from "react";
import { createPortal } from "react-dom";
import { formatCount } from "../../lib/analytics.js";
import { attentionFigures } from "../../lib/attention.js";
import { formatDay } from "../../lib/analytics.js";
import { audienceTable } from "../../lib/audience.js";

const ADV = "#c94a24", OWN = "#3d6fd1", GREEN = "#2f7d5b", AMBER = "#c28a1a", PLUM = "#8a5a9e", GREY = "#9b9086", TRACK = "#ece4da", INK = "#241d19";
const PALETTE = [ADV, OWN, GREEN, AMBER, PLUM, GREY];

const pct = (v, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const sec = (v) => (v == null ? "—" : `${v.toFixed(1)} s`);
const num = (v) => (v == null ? "—" : formatCount(v));
const ms = (v) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const signed = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`);

// ---------------------------------------------------------------- building blocks
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

/** A small "i" next to a title; a click opens a bubble with a short explanation of the block. */
export function Info({ text, title }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const down = (e) => { if (!(btn.current && btn.current.contains(e.target)) && !(e.target.closest && e.target.closest(".ig-bubble"))) close(); };
    const key = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);
  const toggle = (e) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const W = Math.min(270, window.innerWidth - 16);
    const left = clampN(r.left + r.width / 2 - W / 2, 8, window.innerWidth - W - 8);
    const above = window.innerHeight - r.bottom < 150 && r.top > 150;
    setPos({ left, W, arrow: r.left + r.width / 2 - left, above, y: above ? window.innerHeight - r.top + 8 : r.bottom + 8 });
  };
  return (
    <>
      <button type="button" ref={btn} className={`ig-i${pos ? " is-on" : ""}`} aria-label={`About: ${title}`} aria-expanded={!!pos} onClick={toggle}>i</button>
      {pos && createPortal(
        <div className={`ig-bubble${pos.above ? " is-above" : ""}`} role="tooltip" style={{ left: pos.left, width: pos.W, ...(pos.above ? { bottom: pos.y } : { top: pos.y }) }}>
          <span className="ig-bubble-arrow" style={{ left: pos.arrow }} />
          <b>{title}</b>
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

const INFO = {
  ring: "How many of the ad slots were filled when the game started: by advertisers, by your own creatives, or left empty.",
  rep: "The share of players who saw an ad more than once, and how many ads one player saw on average.",
  freq: "How many players saw one, two, three or more ads. It shows whether the same players keep seeing them.",
  why: "For every empty slot, the step where the ad dropped out: nothing booked, audience did not fit, campaign rules and so on.",
  pl: "The share of game starts in which each placement got an ad. The emptiest come first, with the main reason when a placement is weak.",
  fun: "Every time an ad came into view: how many of those chances lasted long enough to be measured, and how many became an engaged view (3 s or more from within 3 m).",
  len: "How long the measured views lasted, in four groups. The median is the typical view.",
  geo: "Where players were when they looked at the ad: average distance, viewing angle, and how much of the screen it took. Averaged over the measured views.",
  int: "How often players touched objects that carry an ad, and which interactive placements get touched most.",
  fat: "Average view time on the 1st, 2nd, 3rd time the same player sees the same creative. A falling line means attention wears out with repeats.",
  ret: "The share of new players who came back 1, 7 and 30 days after their first session.",
  dau: "How many different players played on each day of the period. The dashed line is the average.",
  plat: "The platforms players use, as a share of all sessions or impressions.",
  dev: "The most common device models.",
  cty: "The countries players come from.",
  min: "In which minute of the session the ads were seen, as a share of all views.",
  look: "How long viewers looked at the ad, by the minute of the session. A falling line means attention drops later in a session.",
  scn: "In which scene of the game the player was when they saw the ads, with the average view time and the share of engaged views.",
  fps: "Average frames per second over all sessions, and the share of frames slower than 30 FPS.",
  st: "A stutter is a frame that took longer than 100 ms. Shown per hour of play, together with the single worst frame. The gauge rates it: under 5 an hour is good, up to 15 fair, more is poor.",
  ld: "How fast the ads reach the player: downloading a creative, reading it from the copy on the device, and fetching the list of ads. The gauge rates the creative download: under 0.5 s is good, up to 1.5 s fair, slower is poor.",
  pf: "Average frame rate on each platform, the longest play first.",
  dv: "Average frame rate on each device model, the longest play first.",
  pr: "Problems the SDK reported, with how many there were per 100 sessions.",
  ad: "Frame rate while an ad was in view against the rest of play. Only a hint: the scene differs too.",
  in: "How often players touched objects that carry an ad. It appears once a placement is marked Interactive.",
  table: "The impression numbers behind the chart, day by day, newest first.",
};

function Card({ title, sub, span = 4, o, children, aside, info }) {
  return (
    <section className={`ig-card ig-s${span}`} style={o ? { order: o } : undefined}>
      <header className="ig-card-head">
        <div>
          <div className="ig-titlerow"><h3>{title}</h3>{info && <Info text={info} title={title} />}</div>
          {sub && <p>{sub}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Note({ title, span = 12, o, aside, children }) {
  return (
    <section className={`ig-card ig-note ig-s${span}`} style={o ? { order: o } : undefined}>
      <header className="ig-card-head"><h3>{title}</h3>{aside}</header>
      <p>{children}</p>
    </section>
  );
}

function Ring({ parts, size = 80, stroke = 11, big, small, dashed = false }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  let acc = 0;
  return (
    <div className="ig-ring" style={{ width: size, aspectRatio: "1 / 1" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${big} ${small ?? ""}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} strokeDasharray={dashed ? "3 5" : undefined} />
        {!dashed &&
          parts.map((p, i) => {
            const len = (p.v / total) * C;
            const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
            acc += len;
            return el;
          })}
      </svg>
      <div className="ig-ring-mid">
        <b style={{ fontSize: `${Math.max(0.75, (size / 80) * 0.875)}rem` }}>{big}</b>
        {small && <span style={{ fontSize: `${Math.min(0.78, (size / 80) * 0.5625)}rem` }}>{small}</span>}
      </div>
    </div>
  );
}

function Legend({ items, variant }) {
  return (
    <ul className={`ig-legend${variant ? ` is-${variant}` : ""}`}>
      {items.map((it) => (
        <li key={it.label}>
          <i style={{ background: it.color }} />
          <span>{it.label}</span>
          <b>{it.value}</b>
        </li>
      ))}
    </ul>
  );
}

function Bars({ rows, color = ADV, max }) {
  const top = max ?? Math.max(...rows.map((r) => r.v), 0.0001);
  return (
    <ul className="ig-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="ig-bars-label" title={r.chip ? `${r.label}: ${r.chip}` : r.label}>{r.label}{r.chip && <small>{r.chip}</small>}</span>
          <span className="ig-bars-track"><span style={{ width: `${Math.min(100, Math.max((r.v / top) * 100, r.v > 0 ? 2 : 0))}%`, background: r.color || color }} /></span>
          <span className="ig-bars-text">{r.text}</span>
          </li>
      ))}
    </ul>
  );
}

function Cols({ items, height = 64, color = ADV, valueText, thin = false, line }) {
  const [ref, , mh] = useSize();
  const extra = thin ? 4 : 38;
  const ph = Math.max(height, (mh || height + extra) - extra);
  const top = Math.max(...items.map((i) => i.v), 0.0001);
  return (
    <div className="ig-cols-wrap" ref={ref} style={{ minHeight: height + extra }}>
      {line != null && <span className="ig-cols-avg" style={{ bottom: `${(line / top) * ph + (thin ? 4 : 24)}px` }}>avg {valueText ? valueText(line) : Math.round(line)}</span>}
      <div className={`ig-cols${thin ? " is-thin" : ""}${line != null ? " has-line" : ""}`}>
        {line != null && <span className="ig-cols-line" style={{ bottom: `${(line / top) * ph + (thin ? 4 : 24)}px` }} />}
        {items.map((it, i) => (
          <div key={i} className="ig-col" title={`${it.label}: ${valueText ? valueText(it.v) : it.v}`}>
            {!thin && <span className="ig-col-val">{valueText ? valueText(it.v) : it.v}</span>}
            <span className="ig-col-bar" style={{ height: `${Math.max((it.v / top) * ph, it.v > 0 ? 3 : 0)}px`, background: it.color || color }} />
            {!thin && <span className="ig-col-label">{it.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="ig-stat">
      <span className="ig-stat-label">{label}</span>
      <span className={`ig-stat-value${tone ? ` is-${tone}` : ""}`}>{value}</span>
      {sub && <span className="ig-stat-sub">{sub}</span>}
    </div>
  );
}

function Scale({ label, value, text, min = 0, max, left, right, sub }) {
  const at = value == null ? null : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return (
    <div className="ig-scale">
      <div className="ig-scale-top"><span>{label}</span><b>{text}</b></div>
      <div className="ig-scale-track">{at != null && <i style={{ left: `${at * 100}%` }} />}</div>
      <div className="ig-scale-ends"><span>{left}</span><span>{right}</span></div>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function useSize() {
  const ref = useRef(null);
  const [sz, setSz] = useState([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setSz((o) => (o[0] === el.clientWidth && o[1] === el.clientHeight ? o : [el.clientWidth, el.clientHeight]));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, sz[0], sz[1]];
}

function Steps({ points, unit = sec, delta, h = 112 }) {
  // average view time at the 1st, 2nd, 3rd... time: a line with dots; it is drawn at the width of its block
  const [ref, mw, mh] = useSize();
  const W = Math.max(220, mw || 320), H = Math.max(h, mh || h), padX = 30, padTop = 24, padBot = 20;
  const vals = points.map((p) => p.v ?? 0);
  const top = Math.max(...vals, 0.0001) * 1.15;
  const x = (i) => padX + (i * (W - padX * 2)) / Math.max(points.length - 1, 1);
  const y = (v) => padTop + (1 - v / top) * (H - padTop - padBot);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v ?? 0)}`).join(" ");
  return (
    <div className="ig-steps">
      <div className="ig-steps-plot" ref={ref} style={{ minHeight: h }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average view time by step">
        {[0, 0.5, 1].map((t) => <line key={t} x1={6} x2={W - 6} y1={padTop + t * (H - padTop - padBot)} y2={padTop + t * (H - padTop - padBot)} stroke={TRACK} strokeWidth="1" />)}
        <path d={path} fill="none" stroke={ADV} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.v ?? 0)} r={i === points.length - 1 ? 5 : 3.5} fill={i === points.length - 1 ? ADV : "#fff"} stroke={ADV} strokeWidth="2" />
            <text x={x(i)} y={y(p.v ?? 0) - 10} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={INK}>{p.v == null ? "—" : unit(p.v)}</text>
            <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="11" fill="#6b5f56">{p.label}</text>
          </g>
        ))}
      </svg>
      </div>
      {delta}
    </div>
  );
}

function Gauge({ value, max = 90, big, small, frac: given, ends }) {
  const W = 220, H = 138, r = 92, cx = W / 2, cy = 112;
  const frac = given != null ? given : value == null ? 0 : Math.min(1, Math.max(0, value / max));
  const pt = (f) => [cx + r * Math.cos(Math.PI * (1 - f)), cy - r * Math.sin(Math.PI * (1 - f))];
  const arc = (f) => { const [x, y] = pt(f); return `M${cx - r},${cy} A${r},${r} 0 0 1 ${x},${y}`; };
  return (
    <div className="ig-gauge">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${big} ${small}`}>
        <path d={arc(0.9999)} fill="none" stroke={TRACK} strokeWidth="18" strokeLinecap="round" />
        {frac > 0 && <path d={arc(frac)} fill="none" stroke={AMBER} strokeWidth="18" strokeLinecap="round" />}
        <text x={cx - r} y={cy + 16} textAnchor="middle" fontSize="11" fill="#8c7f73">{ends ? ends[0] : 0}</text>
        <text x={cx + r} y={cy + 16} textAnchor="middle" fontSize="11" fill="#8c7f73">{ends ? ends[1] : max}</text>
      </svg>
      <div className="ig-gauge-mid"><b>{big}</b><span>{small}</span></div>
    </div>
  );
}

function Tile({ label, value, sub, wide }) {
  return (
    <div className={`ig-tile${wide ? " is-wide" : ""}`}>
      <span className="ig-stat-label">{label}</span>
      <span className="ig-stat-value">{value}</span>
      {sub && <span className="ig-stat-sub">{sub}</span>}
    </div>
  );
}

// How well it runs: lower is better. Returns the word and how full the gauge is (fuller = better).
function rating(v, good, fair, worst) {
  if (v == null) return { word: "—", frac: 0 };
  return { word: v <= good ? "Good" : v <= fair ? "Fair" : "Poor", frac: Math.min(1, Math.max(0, 1 - v / worst)) };
}

const DeltaBadge = ({ change, text }) => (change == null ? null : <p className={`ig-delta${change < -0.15 ? " is-down" : ""}`}><b>{signed(change)}</b> {text}</p>);

// ---------------------------------------------------------------- groups
const ok = (x) => x && !x.missing;

function Reach({ m, dev }) {
  const out = [];
  if (dev && ok(m.fill)) {
    const t = m.fill.totals;
    if (t.offered > 0) {
      out.push(
        <Card key="ring" span={4} o={1} title="Slots filled" sub="Placements that got an ad when the game started">
          <div className="ig-ringrow">
            <Ring size={128} stroke={16} parts={[{ v: t.filledAd, color: ADV }, { v: t.filledOwn, color: OWN }, { v: t.empty, color: TRACK }]} big={pct(t.rate)} small="filled" />
            <Legend variant="stack" items={[
              { label: "Advertisers", color: ADV, value: num(t.filledAd) },
              { label: "Your creatives", color: OWN, value: num(t.filledOwn) },
              { label: "Empty", color: TRACK, value: num(t.empty) },
            ]} />
          </div>
        </Card>,
        <Card key="why" span={6} o={4} title="Why slots stayed empty" sub={`${num(t.empty)} empty slots, by the step that dropped the ad`}>
          <Bars rows={m.fill.reasons.filter((r) => r.slots > 0).sort((a, b) => b.slots - a.slots).map((r) => ({ label: r.label, v: r.slots, text: `${num(r.slots)} · ${pct(r.share)}` }))} />
        </Card>,
      );
    } else out.push(<Note key="fn" title="Fill rate">No game start has been counted yet. This fills in as players start the game.</Note>);
  }
  if (ok(m.frequency)) {
    const f = m.frequency;
    if (!f.empty && f.players > 0) {
      out.push(
        <Card key="freq" span={dev ? 4 : 8} o={3} title={dev ? "How often players saw the ads" : "How often players saw the ad"} sub={`${num(f.players)} players, by number of ads seen`}>
          <Cols items={f.buckets.map((b) => ({ label: b.label.replace(" views", "").replace(" view", ""), v: b.players }))} valueText={(v) => num(v)} />
          {f.untracked > 0 && <p className="ig-foot">{num(f.untracked)} more views came from games that do not identify players (SDK before 0.9).</p>}
        </Card>,
        <Card key="rep" span={4} o={2} title="Repeat viewers" sub={dev ? "Players who saw an ad more than once" : "Players who saw it more than once"}>
          <div className="ig-ringrow">
            <Ring size={128} stroke={16} parts={[{ v: f.repeatShare, color: ADV }, { v: 1 - f.repeatShare, color: TRACK }]} big={pct(f.repeatShare)} small="saw it again" />
            <div className="ig-stats is-col">
              <Stat label="Average frequency" value={f.avgFrequency.toFixed(1)} sub="ads per player" />
              {dev && <Stat label="Players" value={num(f.players)} sub="with an install ID" />}
            </div>
          </div>
        </Card>,
      );
    } else out.push(<Note key="fq" title="Frequency">No views from identified players in this period yet (SDK 0.9 or newer).</Note>);
  }
  if (dev && ok(m.fill) && m.fill.places.length > 0) {
    out.push(
      <Card key="pl" span={6} o={5} title="Fill rate by placement" sub="Emptiest first">
        <Bars max={1} rows={m.fill.places.map((p) => ({ label: p.name, v: p.rate ?? 0, text: pct(p.rate), color: (p.rate ?? 0) < 0.6 ? ADV : (p.rate ?? 0) < 0.85 ? AMBER : GREEN, chip: (p.rate ?? 0) < 0.7 && p.mainReason ? p.mainReason.label : null }))} />
      </Card>,
    );
  }
  return out;
}

function Attention({ m, dev }) {
  const out = [];
  if (ok(m.attention)) {
    const f = attentionFigures(m.attention.row);
    if (!f.empty) {
      const top = Math.max(f.opportunities, 1);
      out.push(
        <Card key="fun" span={5} title={dev ? "From a chance to an engaged view" : "From a chance to an engaged view"} sub="Every time the ad came into view, and how far it got">
          <ul className="ig-funnel">
            {[
              { label: "Engaged", v: f.engaged, c: ADV, note: f.engagedRate != null ? `${pct(f.engagedRate)} of seen · 3 s+ from 3 m` : "" },
              { label: "Seen long enough", v: f.measured, c: "#d9744f", note: f.viewability != null ? `${pct(f.viewability)} of chances` : "" },
              { label: "Chances to be seen", v: f.opportunities, c: "#e8b5a3", note: "times the ad came into view" },
            ].map((s) => (
              <li key={s.label}>
                <span className="ig-funnel-bar" style={{ width: `${Math.max((s.v / top) * 100, 3)}%`, background: s.c }}><b>{num(s.v)}</b></span>
                <span className="ig-funnel-label">{s.label}<em>{s.note}</em></span>
              </li>
            ))}
          </ul>
        </Card>,
        <Card key="len" span={3} title="How long views lasted" sub={`Median ${sec(f.medianSeconds)}`}>
          <Cols items={f.buckets.map((b) => ({ label: b.label, v: b.count }))} valueText={(v) => `${Math.round((v / Math.max(f.measured, 1)) * 100)}%`} />
        </Card>,
        <Card key="geo" span={4} title="How the ad was looked at" sub="Average over the measured views">
          <div className="ig-scales">
            <Scale label="Distance" value={f.avgDistance} text={f.avgDistance == null ? "—" : `${f.avgDistance.toFixed(1)} m`} max={10} left="close" right="10 m" />
            <Scale label="Angle" value={f.avgAngle} text={f.avgAngle == null ? "—" : `${Math.round(f.avgAngle)}°`} max={90} left="straight at it" right="90°" />
            <Scale label="Share of the screen" value={f.avgFraction} text={pct(f.avgFraction)} max={0.25} left="0%" right="25%" />
          </div>
        </Card>,
      );
    } else out.push(<Note key="an" title="How well the ads were seen">Seen-time, distance and angle arrive with SDK 0.11 or newer. Nothing measured in this period yet.</Note>);
  }
  if (ok(m.interactions)) {
    const t = m.interactions.totals;
    if (t.views > 0) {
      out.push(
        <Card key="int" span={6} title="Interactions" sub="Touches on objects that carry an ad">
          <div className="ig-split">
            <div className="ig-split-l">
              <Ring size={128} stroke={16} parts={[{ v: t.rate, color: ADV }, { v: 1 - t.rate, color: TRACK }]} big={pct(t.rate)} small="touched" />
              <div className="ig-stats is-col">
                <Stat label="Touches" value={num(t.interactions)} sub={t.perInteracted ? `${t.perInteracted.toFixed(1)} per touched view` : ""} />
                <Stat label="Interactive placements" value={String(t.placements)} sub={`${num(t.views)} views there`} />
              </div>
            </div>
            {m.interactions.places.length > 0 && (
              <div className="ig-split-r">
                <Bars color={ADV} rows={m.interactions.places.map((p) => ({ label: p.name, v: p.rate ?? 0, text: pct(p.rate) }))} max={Math.max(...m.interactions.places.map((p) => p.rate ?? 0), 0.01) * 1.2} />
              </div>
            )}
          </div>
        </Card>,
      );
    } else out.push(
      <Card key="in" span={6} title="Interactions" sub="Touches on objects that carry an ad">
        <div className="ig-ringrow ig-empty-row">
          <Ring size={128} stroke={16} parts={[]} big="—" small="touched" />
          <div className="ig-empty-text">
            <b>{dev ? "Nothing to count yet" : "No touches to count"}</b>
            <p>{dev ? "No placement is marked Interactive. Mark one in Placements and touches show up here." : "Your ad has not run on an interactive object in this period."}</p>
          </div>
        </div>
      </Card>,
    );
  }
  if (ok(m.fatigue)) {
    const fa = m.fatigue;
    if (!fa.empty) {
      out.push(
        <Card key="fat" span={6} title="Does attention fall with repeats?" sub="Average view time the 1st, 2nd, 3rd… time a player sees the same creative">
          <Steps h={132} points={fa.steps.map((s, i) => ({ label: ["1st", "2nd", "3rd", "4–5th", "6th+"][i], v: s.avgSeconds }))} delta={fa.summary ? <DeltaBadge change={fa.summary.change} text={`from the 3rd view on: ${sec(fa.summary.laterSeconds)} against ${sec(fa.summary.firstSeconds)} at first`} /> : <p className="ig-delta">Too few measured views to compare.</p>} />
        </Card>,
      );
    } else out.push(<Note key="fa" span={6} title="Repeats">No repeat views from identified players in this period yet.</Note>);
  }
  return out;
}

function Players({ m, dev }) {
  const out = [];
  if (dev && ok(m.retention)) {
    const r = m.retention;
    if (!r.daily.empty) {
      out.push(
        <Card key="ret" span={5} title="Do players come back?" sub={`${num(r.retention.newPlayers)} new players, counted from their first session`}>
          <div className="ig-rings3">
            {[["Day 1", r.retention.d1], ["Day 7", r.retention.d7], ["Day 30", r.retention.d30]].map(([label, d]) => (
              <div key={label} className="ig-ring-cell">
                <Ring size={68} stroke={9} parts={[{ v: d.rate ?? 0, color: GREEN }, { v: 1 - (d.rate ?? 0), color: TRACK }]} big={pct(d.rate)} dashed={d.rate == null} />
                <b>{label}</b>
                <span>{d.rate == null ? "pick a longer period" : `${num(d.returned)} of ${num(d.players)}`}</span>
              </div>
            ))}
          </div>
        </Card>,
        <Card key="dau" span={7} title="Players each day" sub={`Average ${Math.round(r.daily.average)}${r.daily.peak ? `, peak ${r.daily.peak.players} on ${r.daily.peak.date.slice(5)}` : ""}`}>
          <Cols thin height={56} color={GREEN} items={r.daily.days.map((d) => ({ label: d.date, v: d.players }))} line={r.daily.average} valueText={(v) => String(Math.round(v))} />
          <div className="ig-axis"><span>{r.daily.days[0]?.date.slice(5)}</span><span>{r.daily.days[r.daily.days.length - 1]?.date.slice(5)}</span></div>
        </Card>,
      );
    } else out.push(<Note key="rn" title="Do players come back?">No sessions with identified players in this period yet (SDK 0.10 or newer).</Note>);
  }
  const aud = m.audience || m.players;
  if (ok(aud)) {
    const d = dev ? "sessions" : "views";
    const plat = audienceTable(aud.dimensions?.platform, "platform", dev ? "developer" : "advertiser");
    const dev2 = audienceTable(aud.dimensions?.device, "device", dev ? "developer" : "advertiser", { top: 6 });
    const country = audienceTable(aud.dimensions?.country, "country", dev ? "developer" : "advertiser", { top: 6 });
    const bars = (rows) => <Bars color={GREY} rows={rows.map((r) => ({ label: r.label, v: r.share, text: pct(r.share) }))} />;
    if (plat.length > 0) {
      out.push(
        <Card key="plat" span={5} title="Platform" sub={dev ? "Share of sessions" : "Share of impressions"}>
          <div className="ig-ringrow">
            <Ring size={156} stroke={20} parts={plat.map((r, i) => ({ v: r.share, color: PALETTE[i % PALETTE.length] }))} big={pct(plat[0].share)} small={plat[0].label} />
            <Legend variant="roomy" items={plat.slice(0, 5).map((r, i) => ({ label: r.label, color: PALETTE[i % PALETTE.length], value: pct(r.share) }))} />
          </div>
        </Card>,
        <Card key="dev" span={4} title="Device" sub="Top models">{bars(dev2)}</Card>,
        <Card key="cty" span={3} title="Country" sub="Where players are">{bars(country)}</Card>,
      );
    }
  }
  return out;
}

function Context({ m, dev }) {
  const out = [];
  if (ok(m.minutes)) {
    const t = m.minutes;
    if (!t.empty) {
      const rows = t.rows.filter((r) => r.id !== "unknown");
      out.push(
        <Card key="min" span={dev ? 4 : 6} title="When in the session the ads were seen" sub="Share of views by minutes since the session started">
          <Cols height={52} items={rows.map((r, i) => ({ label: ["1st", "2nd", "3–5", "6–10", "11–20", "20+"][i] ?? r.label, v: r.share }))} valueText={(v) => pct(v)} />
        </Card>,
        <Card key="look" span={dev ? 4 : 6} title="How long they looked" sub="Average view time by minute of the session">
          <Steps h={100} points={rows.map((r, i) => ({ label: ["1st", "2nd", "3–5", "6–10", "11–20", "20+"][i] ?? r.label, v: r.avgSeconds }))} delta={t.summary ? <DeltaBadge change={t.summary.change} text={`after the 10th minute: ${sec(t.summary.late)} against ${sec(t.summary.early)} in the first two`} /> : <p className="ig-delta">Too few measured views to compare.</p>} />
        </Card>,
      );
    } else out.push(<Note key="mn" title="Minute of the session">No views in this period yet.</Note>);
  }
  if (dev && ok(m.scenes)) {
    const s = m.scenes;
    if (!s.empty) {
      const rows = [...s.rows].sort((a, b) => b.views - a.views).slice(0, 5);
      out.push(
        <Card key="scn" span={4} title="Where in the game the ads were seen" sub="Top scenes by views">
          <Bars rows={rows.map((r) => ({ label: r.label, v: r.share, text: `${num(r.views)} · ${pct(r.share)}`, chip: r.avgSeconds != null ? `${sec(r.avgSeconds)} · ${pct(r.engagedRate)} engaged` : null }))} />
        </Card>,
      );
    } else out.push(<Note key="sn" title="Scenes">No views in this period yet.</Note>);
  }
  return out;
}

function Performance({ m }) {
  if (!ok(m.sdk)) return [];
  const { total: t, platforms, devices } = m.sdk;
  if (t.sessions === 0) return [<Note key="n" title="Game performance">No figures yet. They arrive once players run a build with SDK 0.11 or newer.</Note>];
  const cmp = t.withAd.seconds >= 10 && t.withoutAd.seconds >= 10;
  const smooth = rating(t.hitchesPerHour, 5, 15, 40);
  const load = rating(t.loads > 0 ? t.loadAvgMs : null, 500, 1500, 3000);
  const probs = t.problems.filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
  return [
    <Card key="fps" span={3} o={1} title="Frame rate" sub={`${num(t.sessions)} sessions`}>
      <div className="ig-rated">
        <div className="ig-center is-rate">
          <Gauge value={t.fps} big={t.fps == null ? "—" : Math.round(t.fps)} small="average FPS" />
        </div>
        <div className="ig-tiles is-side">
          <Tile label="Frames slower than 30 FPS" value={pct(t.slowShare, 1)} sub="of all frames" />
        </div>
      </div>
      <p className="ig-foot">The gauge runs from 0 to 90 FPS.</p>
    </Card>,
    <Card key="st" span={3} o={2} title="Smoothness" sub="Frames over 100 ms count as stutters">
      <div className="ig-rated">
        <div className="ig-center is-rate">
          <Gauge frac={smooth.frac} big={smooth.word} small="smoothness" ends={["poor", "good"]} />
        </div>
        <div className="ig-tiles is-side">
          <Tile label="Stutters per hour" value={t.hitchesPerHour == null ? "—" : t.hitchesPerHour.toFixed(1)} />
          <Tile label="Worst frame" value={t.worstMs > 0 ? ms(t.worstMs) : "—"} />
        </div>
      </div>
      <p className="ig-foot">Under 5 stutters an hour is good, up to 15 is fair.</p>
    </Card>,
    <Card key="ld" span={3} o={3} title="Loading" sub="How fast the ads reach the player">
      <div className="ig-rated">
        <div className="ig-center is-rate">
          <Gauge frac={load.frac} big={load.word} small="loading" ends={["poor", "good"]} />
        </div>
        <div className="ig-tiles is-side">
          <Tile label="Creative download" value={ms(t.loadAvgMs)} sub={t.loads > 0 ? `slowest ${ms(t.loadMaxMs)}` : ""} />
          <Tile label="From the device copy" value={ms(t.cachedAvgMs)} />
          <Tile label="List of ads" value={ms(t.manifestAvgMs)} />
        </div>
      </div>
      <p className="ig-foot">Creative download: under 0.5 s is good, up to 1.5 s is fair.</p>
    </Card>,
    cmp ? (
      <Card key="ad" span={6} o={6} title="With an ad in view, and without" sub="A hint only: the scene differs too">
        <Bars max={90} rows={[{ label: "Ad in view", v: t.withAd.fps ?? 0, text: `${Math.round(t.withAd.fps ?? 0)} FPS · ${pct(t.withAd.slowShare, 1)} slow`, color: AMBER }, { label: "Rest of play", v: t.withoutAd.fps ?? 0, text: `${Math.round(t.withoutAd.fps ?? 0)} FPS · ${pct(t.withoutAd.slowShare, 1)} slow`, color: "#e3d2a4" }]} />
      </Card>
    ) : (
      <Note key="adn" span={6} o={6} title="With an ad in view, and without">Not enough play time yet to compare (10 s on each side).</Note>
    ),
    <Card key="pr" span={12} o={7} title="SDK problems" sub={`${num(t.problemCount)} in total, ${((t.problemCount / t.sessions) * 100).toFixed(1)} per 100 sessions`}>
      {probs.length ? <Bars color={AMBER} rows={probs.map((p) => ({ label: p.label, v: p.count, text: `${num(p.count)} · ${p.per100.toFixed(1)}/100` }))} /> : <p className="ig-foot">No problems reported.</p>}
    </Card>,
    platforms.length > 0 && (
      <Card key="pf" span={6} o={5} title="Frame rate by platform" sub="Longest play first">
        <Bars max={90} rows={platforms.map((p) => ({ label: p.label, v: p.fps ?? 0, text: `${Math.round(p.fps ?? 0)} FPS · ${num(p.sessions)}`, color: AMBER }))} />
      </Card>
    ),
    devices.length > 0 && (
      <Card key="dv" span={3} o={4} title="Frame rate by device" sub="Longest play first">
        <Bars max={90} rows={devices.slice(0, 6).map((p) => ({ label: p.label, v: p.fps ?? 0, text: `${Math.round(p.fps ?? 0)} FPS · ${num(p.sessions)}`, color: AMBER }))} />
      </Card>
    ),
  ];
}

const GROUPS = [
  { id: "reach", label: "Reach", line: "Whether the ads were shown, and how often one player saw them.", render: Reach, devOnly: false },
  { id: "attention", label: "Attention", line: "Whether the ads were seen, touched and remembered.", render: Attention, devOnly: false },
  { id: "players", label: "Players", line: (dev) => (dev ? "Who plays, and whether they come back." : "Who saw the ad."), render: Players, devOnly: false },
  { id: "context", label: "Context", line: (dev) => (dev ? "Where in the game and when in the session the ads were seen." : "When in the session the ad was seen."), render: Context, devOnly: false },
  { id: "perf", label: "Game performance", line: "How the game and the SDK ran. Only you see this.", render: Performance, devOnly: true },
];

// narrowest comfortable width (px) of blocks that open at their shortest horizontal size
const MINPX = { rep: 280, freq: 330, fun: 250, len: 210, geo: 250, int: 490, plat: 340, dev: 280, cty: 230, min: 290 };
const MINPX_ADV = { int: 280 };
const RESP = new Set(["fps", "st", "ld", "dv"]); // four across on a wide screen, two by two on a narrower one
const DEFAULTS = { developer: ["ring", "rep", "freq", "why", "pl"], advertiser: ["rep", "freq", "fun", "len", "geo"] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function DailyTable({ days, dev, source, o, aside, info }) {
  const showAdv = source !== "own", showOwn = source !== "adv";
  const rows = [...(days ?? [])].reverse();
  return (
    <section className="ig-card ig-s12" style={o ? { order: o } : undefined}>
      <header className="ig-card-head"><div><div className="ig-titlerow"><h3>Impressions by day</h3>{info && <Info text={info} title="Impressions by day" />}</div><p>The numbers behind the chart, newest day first</p></div>{aside}</header>
      <div className="pf-mini dk-table" role="table" aria-label="Impressions by day">
        <div className={`pf-mini-row pf-mini-head${dev ? "" : " is-two"}`} role="row">
          <span role="columnheader">Day (UTC)</span>
          {dev ? <><span className="pf-num" role="columnheader">Advertisers</span><span className="pf-num" role="columnheader">My creatives</span><span className="pf-num" role="columnheader">Total</span></> : <span className="pf-num" role="columnheader">Impressions</span>}
        </div>
        {rows.map((d) => (
          <div key={d.date} className={`pf-mini-row${dev ? "" : " is-two"}`} role="row">
            <span role="cell">{formatDay(d.date)}</span>
            {dev ? <><span className="pf-num" role="cell">{formatCount(d.adv)}</span><span className="pf-num" role="cell">{formatCount(d.own)}</span><span className="pf-num" role="cell">{formatCount((showAdv ? d.adv : 0) + (showOwn ? d.own : 0))}</span></> : <span className="pf-num" role="cell">{formatCount(d.adv)}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Advanced Data": a link under the Impressions-per-day chart that opens a board of widgets. Widgets are switched on in the Widgets menu, dragged by their grip, and resized by their edges. */
export default function MetricsDeck({ kind, model, source = "all", days, initial = null, onChange = null }) {
  const dev = kind === "developer";
  // the layout (open, which widgets, their sizes) comes from the account and goes back through `onChange`
  const [open, setOpenState] = useState(initial?.open ?? false);
  const [menu, setMenu] = useState(false);
  const [sel, setSelState] = useState(Array.isArray(initial?.sel) ? initial.sel : null);
  const sizesStore = useRef(initial?.sizes && typeof initial.sizes === "object" ? initial.sizes : {});
  const [sizes, setSizesState] = useState(sizesStore.current);
  const pickedRef = useRef(Array.isArray(initial?.sel) ? initial.sel : null);
  const openRef = useRef(initial?.open ?? false);
  const save = () => { if (onChange) onChange({ open: openRef.current, sel: pickedRef.current, sizes: sizesStore.current }); };
  const [drag, setDrag] = useState(null);
  const wrap = useRef(null);
  const grid = useRef(null);
  const orderRef = useRef([]);
  const [gridW, setGridW] = useState(0);
  const spansRef = useRef({});
  const setOpen = (v) => { openRef.current = v; setOpenState(v); save(); };
  const setSel = (v) => { pickedRef.current = v; orderRef.current = v ?? orderRef.current; setSelState(v); save(); };
  const setSize = (key, patch) => { sizesStore.current = { ...sizesStore.current, [key]: { ...sizesStore.current[key], ...patch } }; setSizesState(sizesStore.current); save(); };
  const clearSize = (key) => { const { [key]: _drop, ...rest } = sizesStore.current; sizesStore.current = rest; setSizesState(rest); save(); };
  useLayoutEffect(() => {
    if (!open || !grid.current) return;
    const el = grid.current;
    const set = () => setGridW(el.clientWidth);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (!menu) return;
    const down = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);

  // the catalogue of widgets, in group order; what each shows follows the chart's filters through `model`
  const catalog = GROUPS.filter((g) => !g.devOnly || dev).map((g) => {
    const cards = g.render({ m: model, dev }).filter(Boolean).map((el, i) => ({ el, i })).sort((a, b) => (a.el.props.o ?? 0) - (b.el.props.o ?? 0) || a.i - b.i);
    return { id: g.id, label: g.label, items: cards.map(({ el }) => ({ key: String(el.key), title: el.props.title, el })) };
  }).filter((g) => g.items.length > 0);
  if (days) catalog.push({ id: "data", label: "Data", items: [{ key: "table", title: "Impressions by day", el: <DailyTable key="table" days={days} dev={dev} source={source} /> }] });
  if (catalog.length === 0) return null;
  const flat = catalog.flatMap((g) => g.items);
  const byKey = Object.fromEntries(flat.map((x) => [x.key, x]));
  let chosen = (sel ?? DEFAULTS[kind] ?? []).filter((k) => byKey[k]);
  if (sel == null && chosen.length === 0) chosen = flat.slice(0, 4).map((x) => x.key);
  orderRef.current = chosen;
  const on = new Set(chosen);
  const toggle = (k) => setSel(on.has(k) ? chosen.filter((x) => x !== k) : [...chosen, k]);
  const setGroup = (g, v) => setSel(v ? [...chosen, ...g.items.map((x) => x.key).filter((k) => !on.has(k))] : chosen.filter((k) => !g.items.some((x) => x.key === k)));
  const resetAll = () => { sizesStore.current = {}; setSizesState({}); setSel(null); };
  const ownOnly = dev && source === "own";

  // put `key` next to `target` (after = true/false), or the way a drag over a block would (after undefined)
  const moveTo = (key, target, after) => {
    const arr = [...orderRef.current];
    const from = arr.indexOf(key);
    if (from < 0) return false;
    const rest = arr.filter((x) => x !== key);
    const ti = rest.indexOf(target);
    if (ti < 0) return false;
    const at = after == null ? (from < arr.indexOf(target) ? ti + 1 : ti) : after ? ti + 1 : ti;
    rest.splice(at, 0, key);
    if (rest.every((x, i) => x === arr[i])) return false;
    setSel(rest);
    return true;
  };

  // drag a widget by its grip: a ghost follows the pointer, the board re-orders under it
  const startDrag = (e, key, title) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    let last = 0;
    const origW = spansRef.current[key] ?? 12;
    const origH = sizesStore.current[key]?.h;
    document.body.classList.add("ig-dragging");
    const move = (ev) => {
      setDrag({ key, title, x: ev.clientX, y: ev.clientY });
      const edge = 70;
      if (ev.clientY < edge) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
      const now = performance.now();
      if (now - last < 140) return;
      const inside = (r, x, y, pad = 0) => x >= r.left && x <= r.right && y >= r.top - pad && y <= r.bottom + pad;
      const els = [...grid.current.querySelectorAll(".ig-item")];
      const others = els.filter((it) => it.dataset.key !== key).map((it) => ({ k: it.dataset.key, r: it.getBoundingClientRect() }));
      const own = els.find((it) => it.dataset.key === key);
      if (own && inside(own.getBoundingClientRect(), ev.clientX, ev.clientY)) return;
      const hit = others.find((o) => inside(o.r, ev.clientX, ev.clientY));
      if (hit) {
        if (moveTo(key, hit.k)) last = now;
        return;
      }
      // empty space: a free cell at the end of a row, or the blank area under the last row
      const gr = grid.current.getBoundingClientRect();
      if (!inside(gr, ev.clientX, ev.clientY) || others.length === 0) return;
      const order = orderRef.current;
      const row = others.filter((o) => ev.clientY >= o.r.top - 2 && ev.clientY <= o.r.bottom + 2);
      let mates = row, target = null;
      if (row.length) target = row.reduce((a, b) => (order.indexOf(b.k) > order.indexOf(a.k) ? b : a)).k;
      else if (ev.clientY > Math.max(...others.map((o) => o.r.bottom))) { mates = []; target = [...others].sort((a, b) => order.indexOf(b.k) - order.indexOf(a.k))[0].k; }
      if (!target) return;
      const free = 12 - mates.reduce((sum, m) => sum + (spansRef.current[m.k] ?? 12), 0);
      if (mates.length && free < 3) return;
      // make it fit: narrower if the cell is, and let go of a user-set height that is taller than its neighbours
      const patch = {};
      const w = mates.length ? Math.min(origW, free) : origW;
      if (w !== (spansRef.current[key] ?? 12)) patch.w = w;
      const mateH = mates.length ? Math.max(...mates.map((m) => m.r.height)) : 0;
      patch.h = mates.length && origH && origH > mateH ? undefined : origH;
      if (patch.w != null || (sizesStore.current[key]?.h ?? undefined) !== patch.h) setSize(key, patch);
      if (moveTo(key, target, true)) last = now;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("ig-dragging");
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    move(e);
  };

  // pull an edge or the corner of a widget: width snaps to the 12 columns, height to 10 px
  const startResize = (e, key, mode) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const item = e.currentTarget.closest(".ig-item");
    const gr = grid.current.getBoundingClientRect();
    const gap = 8, colW = (gr.width - 11 * gap) / 12;
    const r0 = item.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    document.body.classList.add("ig-dragging");
    const move = (ev) => {
      const patch = {};
      if (mode.includes("x")) patch.w = clamp(Math.round((r0.width + ev.clientX - x0 + gap) / (colW + gap)), 3, 12);
      if (mode.includes("y")) patch.h = Math.max(90, Math.round((r0.height + ev.clientY - y0) / 10) * 10);
      setSize(key, patch);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("ig-dragging");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const keyMove = (e, x, w) => {
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    const k = e.key;
    if (e.shiftKey) {
      if (k === "ArrowLeft" || k === "ArrowRight") setSize(x.key, { w: clamp(w + (k === "ArrowRight" ? 1 : -1), 3, 12) });
      else {
        const h0 = e.currentTarget.closest(".ig-item").getBoundingClientRect().height;
        setSize(x.key, { h: Math.max(90, Math.round((h0 + (k === "ArrowDown" ? 40 : -40)) / 10) * 10) });
      }
    } else {
      const i = chosen.indexOf(x.key), t = chosen[i + (k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1)];
      if (t) moveTo(x.key, t);
    }
  };

  const items = chosen.map((k) => {
    const x = byKey[k];
    const minPx = (!dev && MINPX_ADV[k]) || MINPX[k];
    const colW = (gridW - 11 * 8) / 12;
    const minSpan = minPx && gridW > 0 ? Math.ceil((minPx + 8) / (colW + 8)) : null;
    const w = clamp(sizes[k]?.w ?? minSpan ?? x.el.props.span ?? 12, 3, 12);
    const h = sizes[k]?.h;
    spansRef.current[k] = w;
    const tools = (
      <div className="ig-tools">
        <button type="button" className="ig-grip" aria-label={`Move ${x.title}. Arrow keys move it, Shift with arrows resizes it.`} title="Drag to move" onPointerDown={(e) => startDrag(e, k, x.title)} onKeyDown={(e) => keyMove(e, x, w)}>
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">{[3, 9].flatMap((cx) => [3, 8, 13].map((cy) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="1.4" fill="currentColor" />))}</svg>
        </button>
        <button type="button" className="ig-x" aria-label={`Hide ${x.title}`} title="Hide this widget" onClick={() => toggle(k)}>×</button>
      </div>
    );
    return (
      <div key={k} data-key={k} className={`ig-item ig-w${w}${RESP.has(k) && w === 3 && sizes[k]?.w == null ? " ig-r6" : ""}${drag?.key === k ? " is-dragging" : ""}`} style={h ? { minHeight: h } : undefined}>
        {cloneElement(x.el, { o: undefined, aside: tools, info: INFO[k] })}
        <span className="ig-rs ig-rs-e" title="Drag to change the width · double-click to reset" onPointerDown={(e) => startResize(e, k, "x")} onDoubleClick={() => clearSize(k)} />
        <span className="ig-rs ig-rs-s" title="Drag to change the height · double-click to reset" onPointerDown={(e) => startResize(e, k, "y")} onDoubleClick={() => clearSize(k)} />
      </div>
    );
  });

  return (
    <div className={`dk${open ? " is-open" : ""}`}>
      <button type="button" className="dk-link" aria-expanded={open} aria-controls="dk-panel" onClick={() => setOpen(!open)}>
        Advanced Data
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div id="dk-panel" className="dk-panel">
          <div className="md-head">
            <div>
              <p className="md-sub">Same selection as the chart. Pick widgets, drag the grip to move one, pull an edge to resize.</p>
            </div>
            <div className="wm" ref={wrap}>
              <button type="button" id="wm-btn" className="wm-btn" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2h4v4H2zM8 2h4v4H8zM2 8h4v4H2zM8 8h4v4H8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                Widgets <span className="wm-count">{chosen.length}</span>
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {menu && (
                <div className="wm-pop" role="group" aria-label="Widgets">
                  <div className="wm-cols">
                    {catalog.map((g) => {
                      const n = g.items.filter((x) => on.has(x.key)).length;
                      return (
                        <fieldset key={g.id} className="wm-group">
                          <legend>
                            <button type="button" className="wm-head" title={n < g.items.length ? `Turn on all ${g.label} widgets` : `Turn off all ${g.label} widgets`} aria-pressed={n === g.items.length} onClick={() => setGroup(g, n < g.items.length)}>
                              <span>{g.label}</span>
                              <em>{n}/{g.items.length}</em>
                            </button>
                          </legend>
                          {g.items.map((it) => (
                            <label key={it.key} className="wm-item">
                              <input type="checkbox" checked={on.has(it.key)} onChange={() => toggle(it.key)} />
                              <span>{it.title}</span>
                            </label>
                          ))}
                        </fieldset>
                      );
                    })}
                  </div>
                  <div className="wm-foot">
                    <button type="button" onClick={resetAll}>Reset layout</button>
                    <button type="button" onClick={() => setSel([])}>Clear all</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="ig-grid" ref={grid}>
            {ownOnly && chosen.some((k) => k !== "table") ? <Note title="Advertisers' ads only">These figures describe advertisers' ads. Choose All or Advertisers above the chart to see them. Your own creatives are not measured this way.</Note> : null}
            {ownOnly ? items.filter((el) => el.key === "table") : items}
            {chosen.length === 0 && <div className="ig-empty">No widgets on the board. Open <b>Widgets</b> and tick the ones you want.</div>}
          </div>
          {drag && <div className="ig-ghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>{drag.title}</div>}
        </div>
      )}
    </div>
  );
}
