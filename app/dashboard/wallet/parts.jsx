"use client";

// The pieces the wallet screens share: the hint icons, the big amount, the tables, the line chart of credits per day
// and the two pop-ups (add credits, add budget). Figures and rules come from lib/wallet.js.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Modal from "../modal";
import { AnchoredBubble } from "../bubble";
import { TEST_NOTE, count, credits, dayText, moneyTop, parseAmount, tickText, weekdayText } from "../../../lib/wallet";
import { addBudget, topUp } from "./actions";
import { Busy, Figure, refreshPage, useRefreshing, useWaitMark } from "../wait";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The standard hint: an "i" in a rounded square that opens a dark bubble with a short explanation (the same look as
 * the Info of the widget boards). `mark` turns it into the amber "!" beside a Wallet title: that one also opens when
 * the pointer is over it.
 */
export function Hint({ title = "", text, mark = false, label = null }) {
  const [pos, setPos] = useState(null);
  const [pinned, setPinned] = useState(false);
  const button = useRef(null);
  const close = () => { setPos(null); setPinned(false); };
  useEffect(() => {
    if (!pos) return undefined;
    const down = (event) => { if (!button.current?.contains(event.target) && !event.target.closest?.(".ig-bubble")) close(); };
    const key = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);
  const open = () => {
    setPos(button.current.getBoundingClientRect());
  };
  const toggle = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (pos && (pinned || !mark)) return close();
    open();
    setPinned(true);
  };
  const hover = mark ? { onMouseEnter: () => !pos && open(), onMouseLeave: () => !pinned && setPos(null), onFocus: () => !pos && open(), onBlur: () => !pinned && setPos(null) } : {};
  return (
    <>
      <button type="button" ref={button} className={`ig-i${mark ? " wl-mark" : ""}${pos ? " is-on" : ""}`} aria-label={label ?? `About: ${title}`} aria-expanded={Boolean(pos)} onClick={toggle} {...hover}>{mark ? "!" : "i"}</button>
      {pos && (
        <AnchoredBubble rect={pos}>
          {title ? <b>{title}</b> : null}
          {text}
        </AnchoredBubble>
      )}
    </>
  );
}

/** The "!" beside a Wallet title: credits are demo units. */
export function TestMark() {
  return <Hint mark text={TEST_NOTE} label="Test mode: credits are demo units for the pilot" />;
}

/** A dark pill at the bottom of the screen for a few seconds. */
export function walletToast(text) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".toast.wl-toast").forEach((old) => old.remove());
  const element = document.createElement("div");
  element.className = "toast wl-toast";
  element.setAttribute("role", "status");
  element.textContent = text;
  document.body.appendChild(element);
  requestAnimationFrame(() => element.classList.add("on"));
  setTimeout(() => element.classList.remove("on"), 2800);
  setTimeout(() => element.remove(), 3200);
}

/** The big amount of a wallet: a title, the figure with "C." and what sits on its line, and a caption under it. */
export function HeroAmount({ label, value, sub, extra = null, after = null }) {
  return (
    <>
      <span className="wl-hero-k">{label}</span>
      <div className="wl-hero-row"><span className="wl-hero-v"><Figure>{value}</Figure></span><span className="wl-hero-u">C.</span>{extra}</div>
      <div className="wl-hero-foot"><span className="wl-hero-sub">{sub}</span>{after}</div>
    </>
  );
}

/** The amount on the left, three short figures on the right: [label, value, caption]. */
export function SumBlock({ hero, cells }) {
  return (
    <section className="wl-hero">
      <div className="wl-hero-main">{hero}</div>
      <dl className="wl-hero-side">
        {cells.map(([label, value, caption]) => (
          <div key={label}><span><dt>{label}</dt><small>{caption}</small></span><dd><Figure>{value}</Figure></dd></div>
        ))}
      </dl>
    </section>
  );
}

/** A titled table in a white box. `head`: [[label, numeric?]]. */
export function TableBox({ title, tools = null, head, children, note = null, className = "" }) {
  // while the page fetches its figures again the rows fade and a wheel turns beside the title
  const waiting = useRefreshing();
  return (
    <section className={`gp-panel gp-tablebox wl-box${waiting ? " is-waiting" : ""}${className ? ` ${className}` : ""}`} aria-busy={waiting || undefined}>
      <div className="gp-table-head"><h2>{title}{waiting && <span className="wait-wheel wl-boxwheel" role="status" aria-label="Updating" />}</h2><div className="gp-tools">{tools}</div></div>
      <div className="gp-scroll">
        <table className="gp-table wl-table">
          <thead><tr>{head.map(([label, numeric], index) => <th key={index} className={numeric ? "num" : undefined}>{label}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {note}
    </section>
  );
}

export function Bar({ pct, tone }) {
  return <span className="wl-bar"><i style={{ width: `${clamp(pct, 0, 100)}%`, background: tone }} /></span>;
}

/** "+250.00" in green or "−150.00" in ink. */
export function Amount({ value }) {
  return <span className={`wl-amt ${value >= 0 ? "is-plus" : "is-minus"}`}>{value >= 0 ? "+" : "−"}{credits(Math.abs(value))}</span>;
}

/** The period switch of a wallet chart. */
export function PeriodPick({ value, options = [7, 30], onChange }) {
  return (
    <div className="cr-tabs" role="tablist" aria-label="Period">
      {options.map((days) => <button key={days} type="button" role="tab" aria-selected={value === days} onClick={() => onChange(days)}>{days} days</button>)}
    </div>
  );
}

const isoDay = (date) => date.toISOString().slice(0, 10);
const shiftDay = (day, by) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000));

/** The first and last day of a History period: { days: 7 | 30 | 90 } counts back from today, { from, to } is a range. */
export function historyRange(period, today = isoDay(new Date())) {
  if (period.days) return [shiftDay(today, -(period.days - 1)), today];
  const from = period.from || "0000-01-01";
  const to = period.to || today;
  return from <= to ? [from, to] : [to, from];
}

/**
 * The period of a History list: the last 7, 30 or 90 days, or a range of dates of one's own (two date fields appear).
 * `value` is { days } or { from, to }; `min` is the earliest day there are lines for (null: no limit).
 */
export function HistoryPeriod({ value, onChange, min = null }) {
  const today = isoDay(new Date());
  const custom = !value.days;
  const [from, to] = historyRange(value, today);
  return (
    <div className="wl-period">
      <div className="cr-tabs" role="tablist" aria-label="Period">
        {[7, 30, 90].map((days) => <button key={days} type="button" role="tab" aria-selected={value.days === days} onClick={() => onChange({ days })}>{days} days</button>)}
        <button type="button" role="tab" aria-selected={custom} onClick={() => !custom && onChange({ from: min && from < min ? min : from, to })}>Dates</button>
      </div>
      {custom && (
        <span className="wl-range">
          <input className="field" type="date" aria-label="From" value={value.from ?? ""} min={min ?? undefined} max={value.to || today} onChange={(event) => onChange({ ...value, from: event.target.value })} />
          <span aria-hidden="true">–</span>
          <input className="field" type="date" aria-label="To" value={value.to ?? ""} min={value.from || min || undefined} max={today} onChange={(event) => onChange({ ...value, to: event.target.value })} />
        </span>
      )}
    </div>
  );
}

const W = 1000;
const H = 170;

/**
 * Credits per day as a line: the dashboard's own chart (the Overview's), with a cursor and a tooltip under the pointer.
 *   days      ISO days, oldest first; the last one is today and is drawn dashed (it is still being counted)
 *   rows      [{ value, impressions }] per day: the one line, when `lines` is not given
 *   lines     [{ id, name, color, tint, total?, values }]: one line each; the one marked `total` keeps the fill
 *   what      the name of the single line in the tooltip ("Earned", "Spent"...)
 */
export function MoneyChart({ title, hint = null, tools = null, days, rows, what, lines = null, legend = null, emptyText = "" }) {
  const [at, setAt] = useState(null);
  const svg = useRef(null);
  const series = lines ?? [{ id: "one", name: what, color: "#c94a24", tint: "#f0b293", values: rows.map((row) => row.value) }];
  const length = days.length;
  const top = moneyTop(Math.max(0, ...series.flatMap((line) => line.values)));
  const x = (index) => (length > 1 ? (index / (length - 1)) * W : W / 2);
  const y = (value) => H - (value / top) * H;
  const points = (values, upTo = values.length) => values.slice(0, upTo).map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const best = rows.reduce((found, row, index) => (row.value > found.value ? { value: row.value, index } : found), { value: -1, index: 0 });
  const filled = lines ? lines.find((line) => line.total) : series[0];
  const last = length - 1;

  const move = (event) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    setAt(clamp(Math.round(((event.clientX - box.left) / box.width) * (length - 1)), 0, length - 1));
  };
  const left = at == null ? 0 : length > 1 ? (at / (length - 1)) * 100 : 50;
  const shown = at == null ? [] : lines ? [...lines].sort((a, b) => (b.total ? Number.MAX_VALUE : b.values[at]) - (a.total ? Number.MAX_VALUE : a.values[at])) : series;
  const several = lines && lines.filter((line) => !line.total).length > 1 && !lines.some((line) => line.total);

  return (
    <section className="panel ovx-chart wl-chartbox">
      <div className="ovx-chart-head"><h2>{title} {hint}</h2><div className="wl-chtools">{tools}</div></div>
      {lines ? legend : (
        <div className="wl-chsum">
          <span>Total <b>{credits(total)} C.</b></span>
          <span>Average <b>{credits(total / Math.max(1, length))} C.</b> a day</span>
          <span>Best day <b>{dayText(days[best.index])}</b> · {credits(Math.max(0, best.value))} C.</span>
          <span className="wl-todaykey"><i />Dashed: today so far</span>
        </div>
      )}
      <div className="ovx-plotwrap" style={{ paddingBottom: 14 }}>
        <div className="ovx-yaxis" aria-hidden="true">{[top, (top * 3) / 4, top / 2, top / 4, 0].map((value, index) => <span key={index}>{tickText(value)}</span>)}</div>
        <div className="ovx-plot" onPointerMove={move} onPointerLeave={() => setAt(null)}>
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}, ${length} days`}>
            {[0, 0.25, 0.5, 0.75, 1].map((step) => <line key={step} x1="0" x2={W} y1={H - step * H + 0.5} y2={H - step * H + 0.5} className={step === 0 ? "ovx-base" : "ovx-grid"} vectorEffect="non-scaling-stroke" />)}
            {filled && length > 0 ? <polygon points={`0,${H} ${points(filled.values)} ${W},${H}`} className="wl-charea" /> : null}
            {series.map((line) => (
              <g key={line.id}>
                <polyline points={points(line.values, length > 1 ? last : length)} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {length > 1 ? <line x1={x(last - 1).toFixed(1)} y1={y(line.values[last - 1]).toFixed(1)} x2={x(last).toFixed(1)} y2={y(line.values[last]).toFixed(1)} className="wl-todayline" stroke={line.color} strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
              </g>
            ))}
          </svg>
          {series.length === 0 ? <div className="ovx-plot-empty">{emptyText}</div> : null}
          {at != null && series.length > 0 ? (
            <>
              <div className="ovx-cursor" style={{ left: `${left}%` }} />
              <span className="wl-chdots">{series.map((line) => <span key={line.id} className="wl-chdot" style={{ left: `${left}%`, top: H - (line.values[at] / top) * H, background: line.color }} />)}</span>
              <div className={`ovx-tip${left < 50 ? " is-right" : ""}`} role="status" style={{ left: `${left}%` }}>
                <b>{weekdayText(days[at])}{at === last ? " · today so far" : ""}</b>
                {shown.map((line) => <div key={line.id} className="ovx-tip-row"><span style={{ color: line.tint }}>● {line.name}</span><b>{credits(line.values[at])} C.</b></div>)}
                {several ? <div className="ovx-tip-row ovx-tip-total"><span>Shown games together</span><b>{credits(lines.reduce((sum, line) => sum + line.values[at], 0))} C.</b></div> : null}
                {lines ? null : <div className="ovx-tip-row"><span>Paid impressions</span><b>{count(rows[at].impressions)}</b></div>}
              </div>
            </>
          ) : <span className="wl-chdots" />}
          <div className="ovx-xaxis" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map((step) => <span key={step}>{dayText(days[Math.round(step * (length - 1))])}</span>)}</div>
        </div>
      </div>
    </section>
  );
}

function AmountField({ value, onChange, label, quick, disabled }) {
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return (
    <>
      <label className="wl-wfield is-wide"><input ref={input} className="field" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} disabled={disabled} /><em>C.</em></label>
      <div className="wl-quick">{quick.map((amount) => <button key={amount} type="button" className="button button-quiet wl-sm" onClick={() => onChange(String(amount))} disabled={disabled}>{count(amount)}</button>)}</div>
    </>
  );
}

/**
 * The "Add credits" pop-up. `need`: what a campaign is short of, to start the field from the next round amount.
 * `onDone(result)` is called after the credits were added (the page is refreshed either way).
 */
export function TopUpDialog({ open, onClose, available, need = 0, onDone = null }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useWaitMark(Boolean(busy));
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) { setValue(String(need > 0 ? Math.ceil(need / 50) * 50 : 500)); setError(""); }
  }, [open, need]);
  async function submit() {
    if (busy) return;
    const amount = parseAmount(value);
    if (!(amount > 0)) return setError("Type an amount above zero.");
    setBusy(true); setError("");
    const result = await topUp({ amount }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    walletToast(`${credits(result.amount)} C. added to your wallet`);
    onDone?.(result);
    onClose();
    refreshPage(router);
  }
  return (
    <Modal open={open} onClose={onClose} title="Add credits" busy={busy} className="wl-dialog"
      footer={<><button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="button" onClick={submit} disabled={busy}>{busy ? <Busy>Adding…</Busy> : "Add credits"}</button></>}>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <p className="muted wl-p">Type any amount. Credits are demo units: nothing is charged.</p>
        <AmountField value={value} onChange={setValue} label="Amount in credits" quick={[100, 500, 1000, 5000]} disabled={busy} />
        <p className="wl-after">Available now: <b>{credits(available)}</b></p>
        {error ? <p className="wl-err" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

/** The "Add budget" pop-up of one campaign: { id, name, budget (as budgetOf gives it) }. */
export function BudgetDialog({ campaign, onClose, available }) {
  const router = useRouter();
  const [value, setValue] = useState("100");
  const [busy, setBusy] = useState(false);
  useWaitMark(Boolean(busy));
  const [error, setError] = useState("");
  const open = Boolean(campaign);
  useEffect(() => { if (open) { setValue("100"); setError(""); } }, [open, campaign?.id]);
  const state = campaign?.budget;
  async function submit() {
    if (busy || !campaign) return;
    const amount = parseAmount(value);
    if (!(amount > 0)) return setError("Type an amount above zero.");
    if (amount > available + 1e-9) return setError(`Your wallet has ${credits(available)} C. Add credits first or type a smaller amount.`);
    setBusy(true); setError("");
    const result = await addBudget({ campaignId: campaign.id, amount }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    walletToast(result.resumed ? `${campaign.name} is running again` : `${credits(result.amount)} C. added to the budget`);
    onClose();
    refreshPage(router);
  }
  return (
    <Modal open={open} onClose={onClose} title={`Add budget · ${campaign?.name ?? ""}`} busy={busy} className="wl-dialog"
      footer={<><button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="button" onClick={submit} disabled={busy}>{busy ? <Busy>Adding…</Busy> : "Add budget"}</button></>}>
      {campaign ? (
        <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <p className="muted wl-p">The amount moves from your wallet into this campaign’s budget. {state.out || state.closed ? "The campaign starts showing again by itself." : ""}</p>
          <AmountField value={value} onChange={setValue} label="Amount in credits" quick={[50, 100, 250, 500]} disabled={busy} />
          <p className="wl-after">In your wallet: <b>{credits(available)}</b> · campaign budget now: <b>{credits(state.budget)}</b> ({credits(state.left)} left)</p>
          {error ? <p className="wl-err" role="alert">{error}</p> : null}
        </form>
      ) : null}
    </Modal>
  );
}
