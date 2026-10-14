"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { pauseCampaign, stopCampaign } from "../advertising/actions";
import { addD, diff, fmtDay, todayISO, TONE } from "./dates";
import { IcCheck, IcChevron, IcPause, IcPlay, IcStop } from "./icons";

/** A floating panel anchored to a button, drawn above everything so no table or card can cut it off. */
export function Pop({ anchor, open, onClose, width = 230, align = "end", children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 240;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    let left = align === "end" ? r.right - width : r.left;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    setPos({ top, left });
  }, [open, width, align]);
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    const key = (e) => e.key === "Escape" && onClose();
    const move = () => onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div ref={ref} className="rd-pop" role="menu" aria-label={label} style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width, visibility: pos ? "visible" : "hidden" }}>{children}</div>,
    document.body
  );
}

/** A hint on hover or keyboard focus, also drawn above everything. */
export function Tip({ content, children, side = "bottom", align = "center", wide = false }) {
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const show = () => ref.current && setRect(ref.current.getBoundingClientRect());
  return (
    <span ref={ref} className="rd-tipwrap" onMouseEnter={show} onMouseLeave={() => setRect(null)} onFocus={show} onBlur={() => setRect(null)}>
      {children}
      {rect && createPortal(
        <div className={`rd-tip${wide ? " is-wide" : ""}`} role="tooltip" style={{ left: align === "end" ? rect.right : rect.left + rect.width / 2, top: side === "bottom" ? rect.bottom + 8 : rect.top - 8, transform: `translate(${align === "end" ? "-100%" : "-50%"}, ${side === "bottom" ? "0" : "-100%"})` }}>{content}</div>,
        document.body
      )}
    </span>
  );
}

export function MenuItem({ icon, children, danger, onClick, hint, disabled, href }) {
  return (
    <button type="button" role="menuitem" className={`rd-mi${danger ? " is-danger" : ""}`} onClick={onClick} disabled={disabled}>
      <span className="rd-mi-ic">{icon}</span>
      <span className="rd-mi-text">{children}{hint && <small>{hint}</small>}</span>
    </button>
  );
}
export const MenuSep = () => <div className="rd-mi-sep" role="separator" />;

/** Dates of a campaign as a bar: where it starts, where it ends, where today is. */
export function DateRange({ start, end, tone = "#1b8a50", size = "sm", paused = false, animated = false, today = todayISO(), preview = null }) {
  const style = { "--tone": tone };
  if (!start && !end) {
    return <div className={`rd-dr is-${size} is-none`} style={style}><div className="rd-dr-top"><span className="rd-dr-empty">Not scheduled</span></div><div className="rd-dr-track" /><div className="rd-dr-note">Dates are set with the placements</div></div>;
  }
  if (preview) {
    return (
      <div className={`rd-dr is-${size}${end ? "" : " is-open"}${diff(start, today) > 0 ? " is-future" : ""}`} style={style}>
        <div className="rd-dr-top"><b>{fmtDay(start, size === "lg")}</b><span className="rd-dr-arrow" aria-hidden="true">→</span><b>{end ? fmtDay(end, size === "lg") : "No end"}</b></div>
        <div className="rd-dr-track" role="img" aria-label={preview}><i className="rd-dr-fill" style={{ width: end ? "100%" : "70%", opacity: 0.45 }} />{!end && <span className="rd-dr-inf" aria-hidden="true">›</span>}</div>
        <div className="rd-dr-note">{preview}</div>
      </div>
    );
  }
  const total = end ? diff(end, start) + 1 : null;
  const elapsed = diff(today, start) + 1;
  const before = elapsed < 1;
  const after = end && diff(today, end) > 0;
  const left = end ? diff(end, today) : null;
  const pct = before ? 0 : after ? 100 : end ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 72;
  const nowPct = before || after || !end ? null : Math.min(99, Math.max(1, ((elapsed - 0.5) / total) * 100));
  let note;
  if (before) note = `Starts in ${diff(start, today)} ${diff(start, today) === 1 ? "day" : "days"}`;
  else if (after) note = `Ended ${diff(today, end)} ${diff(today, end) === 1 ? "day" : "days"} ago`;
  else if (end) note = `Day ${elapsed} of ${total} · ${left === 0 ? "ends today" : `${left} ${left === 1 ? "day" : "days"} left`}`;
  else note = `Day ${elapsed} · no end date`;
  if (paused && !before && !after) note = `Paused · ${note}`;
  return (
    <div className={`rd-dr is-${size}${end ? "" : " is-open"}${after ? " is-over" : ""}${before ? " is-future" : ""}${paused ? " is-paused" : ""}${animated && !before && !after ? " is-running" : ""}`} style={style}>
      <div className="rd-dr-top">
        <b>{fmtDay(start, size === "lg")}</b>
        <span className="rd-dr-arrow" aria-hidden="true">→</span>
        <b>{end ? fmtDay(end, size === "lg") : "No end"}</b>
        {total && <span className="rd-dr-len">{total} days</span>}
        {!end && <span className="rd-dr-len">until stopped</span>}
      </div>
      <div className="rd-dr-track" role="img" aria-label={note}>
        <i className="rd-dr-fill" style={{ width: `${pct}%` }} />
        {!end && <span className="rd-dr-inf" aria-hidden="true">›</span>}
      </div>
      <div className="rd-dr-note">{note}</div>
    </div>
  );
}

/** A coloured status chip that opens the campaign's pause / stop choices. */
export function StatusMenu({ status, name, campaignId, pausedUntil = null, locked = false, today = todayISO() }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState(null);
  const tone = TONE[status.key] ?? "#8c7f73";
  const interactive = !locked && !["ended", "draft"].includes(status.key);
  const pick = (mode) => { setOpen(false); setDlg(mode); };
  const note = status.key === "paused" && pausedUntil ? `Paused until ${fmtDay(pausedUntil, true)}. It resumes by itself.` : status.note;
  return (
    <>
      <button ref={btn} type="button" className="rd-status" style={{ "--tone": tone }} disabled={!interactive} aria-haspopup={interactive ? "menu" : undefined} aria-expanded={interactive ? open : undefined} onClick={() => setOpen((v) => !v)}>
        <i className="rd-status-dot" />
        <span>{status.label}</span>
        {interactive && <IcChevron size={14} />}
      </button>
      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} align="start" width={270} label="Campaign actions">
        {note && <div className="rd-pop-note">{note}</div>}
        {status.key === "paused" ? (
          <>
            <MenuItem icon={<IcPlay />} onClick={() => pick("resume")} hint="Ads return at the next launch of each game">Resume now</MenuItem>
            <MenuItem icon={<IcPause />} onClick={() => pick("pause")}>Change the pause…</MenuItem>
          </>
        ) : (
          <MenuItem icon={<IcPause />} onClick={() => pick("pause")} hint="For a day, a week, until a date…">Pause the campaign…</MenuItem>
        )}
        <MenuSep />
        <MenuItem icon={<IcStop />} danger onClick={() => pick("stop")} hint="Ends it today in every game">Stop the campaign…</MenuItem>
      </Pop>
      {dlg && <PauseDialog name={name} campaignId={campaignId} initial={dlg} status={status.key} today={today} onClose={() => setDlg(null)} />}
    </>
  );
}

/** Pause for a while, resume, or stop a campaign for good. */
export function PauseDialog({ name, campaignId, initial = "pause", status = "live", today = todayISO(), onClose }) {
  const ref = useRef(null);
  const router = useRouter();
  const paused = status === "paused";
  const [choice, setChoice] = useState(initial === "stop" ? "stop" : initial === "resume" ? "resume" : "3d");
  const [until, setUntil] = useState(addD(today, 10));
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const days = { "1d": 1, "3d": 3, "7d": 7 };
  const back = (n) => fmtDay(addD(today, n), true);
  const options = [
    ...(paused ? [["resume", "Resume now", "Ads return at the next launch of each game"]] : []),
    ["1d", "For 1 day", `Back on ${back(1)}`],
    ["3d", "For 3 days", `Back on ${back(3)}`],
    ["7d", "For a week", `Back on ${back(7)}`],
    ["date", "Until a date", null],
    ["open", "Until I resume it", "Stays paused with no end date"],
  ];
  async function apply() {
    setBusy(true);
    setError("");
    let result;
    let text;
    let title = "Campaign paused";
    try {
      if (choice === "stop") {
        result = await stopCampaign({ campaignId });
        title = "Campaign stopped";
        text = `“${name}” ends today in every game. You can duplicate it to run again.`;
      } else if (choice === "resume") {
        result = await pauseCampaign({ campaignId, paused: false });
        title = "Campaign resumed";
        text = "Ads come back at the next launch of each game.";
      } else {
        const day = choice === "open" ? null : choice === "date" ? until : addD(today, days[choice]);
        result = await pauseCampaign({ campaignId, paused: true, until: day });
        text = day ? `Paused until ${fmtDay(day, true)}. It resumes by itself.` : "Paused until you resume it.";
      }
    } catch {
      result = { error: "Connection lost. Try again." };
    }
    setBusy(false);
    if (result?.error) return setError(result.error);
    setDone({ title, text });
    router.refresh();
  }
  const stop = choice === "stop";
  return (
    <dialog ref={ref} className="modal rd-dialog" aria-labelledby="rd-pause-title" onClose={onClose}>
      <div className="modal-box">
        <div className="rd-dhead">
          <div><h2 id="rd-pause-title">{done ? done.title : stop ? "Stop campaign" : paused ? "Pause settings" : "Pause campaign"}</h2><p className="rd-dsub">{name}</p></div>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
        </div>
        {done ? (
          <div className="rd-dbody"><div className="rd-done"><span><IcCheck size={20} /></span><p>{done.text}</p></div></div>
        ) : (
          <div className="rd-dbody">
            {!stop && <p className="rd-dhint">Its ads stop in every game. Players see the change at their next launch.</p>}
            <div className="rd-opts" role="radiogroup" aria-label="How long">
              {options.map(([id, label, hint]) => (
                <label key={id} className={`rd-opt${choice === id ? " is-on" : ""}`}>
                  <input type="radio" name="rd-pause" checked={choice === id} onChange={() => setChoice(id)} />
                  <span className="rd-opt-main"><b>{label}</b>{hint && <small>{hint}</small>}</span>
                  {id === "date" && <input type="date" className="field rd-opt-date" value={until} min={addD(today, 1)} onFocus={() => setChoice("date")} onChange={(e) => { setUntil(e.target.value); setChoice("date"); }} aria-label="Pause until" />}
                </label>
              ))}
            </div>
            <div className="rd-opts rd-opts-danger">
              <label className={`rd-opt is-danger${stop ? " is-on" : ""}`}>
                <input type="radio" name="rd-pause" checked={stop} onChange={() => setChoice("stop")} />
                <span className="rd-opt-main"><b>Stop the campaign</b><small>Ends it today in every game. It cannot be resumed; duplicate it to run again.</small></span>
              </label>
            </div>
            {error && <p className="error" role="alert" style={{ margin: "12px 0 0" }}>{error}</p>}
          </div>
        )}
        <div className="rd-dfoot">
          {done ? (
            <button type="button" className="button" onClick={() => ref.current?.close()}>Done</button>
          ) : (
            <>
              <button type="button" className="button button-quiet" onClick={() => ref.current?.close()} disabled={busy}>Cancel</button>
              <button type="button" className={`button${stop ? " button-danger" : ""}`} onClick={apply} disabled={busy || (choice === "date" && !until)}>{busy ? "Saving…" : stop ? "Stop campaign" : choice === "resume" ? "Resume campaign" : "Pause campaign"}</button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function StatusPillV2({ status }) {
  return <span className="rd-pill" style={{ "--tone": TONE[status.key] ?? "#8c7f73" }}><i />{status.label}</span>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The calendar bubble itself, anchored to any element. */
export function CalendarPop({ anchor, open, onClose, value, min, onChange, label, align = "start" }) {
  const today = todayISO();
  const [view, setView] = useState((value || min || today).slice(0, 7));
  useEffect(() => { if (open) setView((value || min || today).slice(0, 7)); }, [open]);
  const [y, m] = view.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${view}-${String(i + 1).padStart(2, "0")}`)];
  const go = (n) => setView(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  return (
    <Pop anchor={anchor} open={open} onClose={onClose} width={296} align={align} label={label}>
      <div className="rd-cal">
        <div className="rd-cal-head"><button type="button" aria-label="Previous month" onClick={() => go(-1)}>‹</button><b>{MONTHS[m - 1]} {y}</b><button type="button" aria-label="Next month" onClick={() => go(1)}>›</button></div>
        <div className="rd-cal-grid">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <i key={i} className="rd-cal-dow">{d}</i>)}
          {cells.map((d, i) => d === null ? <i key={i} /> : (
            <button key={d} type="button" disabled={Boolean(min) && d < min} className={`rd-cal-day${d === value ? " is-on" : ""}${d === today ? " is-today" : ""}`} onClick={() => { onChange(d); onClose(); }}>{Number(d.slice(8))}</button>
          ))}
        </div>
      </div>
    </Pop>
  );
}
/** A date field: a button that opens a small calendar bubble. */
export function DatePick({ value, min, onChange, placeholder = "Pick a date", label, className = "" }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={btn} type="button" className={`field wz-date-btn${value ? "" : " is-empty"} ${className}`} aria-haspopup="dialog" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6h14v14H5zM5 10h14M9 3v5M15 3v5" /></svg>
        <span>{value ? fmtDay(value, true) : placeholder}</span>
      </button>
      <CalendarPop anchor={btn} open={open} onClose={() => setOpen(false)} value={value} min={min} onChange={onChange} label={label} />
    </>
  );
}
