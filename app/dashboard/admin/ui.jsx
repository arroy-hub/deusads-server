"use client";

import { useEffect, useRef } from "react";
import { Info } from "../metrics-deck";
import { ariaSort } from "../../../lib/sort";

const ICONS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  dismiss: "M12 3a9 9 0 100 18 9 9 0 000-18zM9 9l6 6M15 9l-6 6",
  pause: "M8 5v14M16 5v14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
  stats: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  list: "M4 6h16M4 12h16M4 18h10",
  chev: "M9 5l7 7-7 7",
  expand: "M7 9l5 5 5-5M7 4l5 5 5-5",
  collapse: "M7 15l5-5 5 5M7 20l5-5 5 5",
};

export function Icon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** A status label. tone: good | warn | bad | info | (none = grey). */
export function Pill({ tone = "", dot = true, children, title }) {
  return <span className={`cb-pill ${tone}${dot ? "" : " nodot"}`} title={title}>{children}</span>;
}

/** An icon-only button: the name shows when it is pointed at or focused. */
export function IconBtn({ icon, tip, danger = false, onClick, disabled = false, pressed }) {
  return (
    <button type="button" className={`cb-ib${danger ? " d" : ""}`} data-tip={tip} aria-label={tip} aria-pressed={pressed} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick?.(e); }}>
      <Icon name={icon} />
    </button>
  );
}

/** A column title that sorts on a click: first click the natural direction, second reverses, third resets. */
export function SortTh({ label, k, sort, onSort, align }) {
  const on = sort?.key === k;
  return (
    <span aria-sort={ariaSort(sort, k)} style={align ? { textAlign: align } : undefined}>
      <button type="button" className={`cb-th-sort${on ? " on" : ""}`} aria-label={`Sort by ${label}`} onClick={() => onSort(k)}>
        {label}
        <i aria-hidden="true">{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</i>
      </button>
    </span>
  );
}

/** A labelled select in a pill ("Show: All accounts"). options: [[value, label], …]. */
export function Dropdown({ label, value, options, onChange }) {
  return (
    <label className="cb-dd">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

/** The header band: title with an optional "i" bubble, a one-line subtitle, actions on the right, optional tabs underneath. */
export function Band({ title, info, sub, actions, tabs }) {
  return (
    <div className={`cb-band${tabs ? "" : " nt"}`}>
      <div className="cb-band-row">
        <div>
          <h1>{title}{info && <Info title={title} text={info} />}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{actions}</div>}
      </div>
      {tabs && <div className="cb-tabs" role="tablist">{tabs}</div>}
    </div>
  );
}

export function Tab({ current, count, hot, onClick, children }) {
  return (
    <button type="button" role="tab" className="cb-tab" aria-current={current ? "page" : undefined} onClick={onClick}>
      {children}
      {count != null && <span className={`cb-cnt${hot ? " hot" : ""}`}>{count}</span>}
    </button>
  );
}

/**
 * A card over the page: the browser's modal dialog (dims the page, keeps focus inside, Escape closes), centred,
 * a click on the dim area closes it too, and the close button sits outside the card. The content is only built while open.
 */
export function CardPopup({ open, onClose, label, width = 920, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="cb-pop" aria-label={label} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget || e.target.dataset?.backdrop) onClose(); }}>
      {open && (
        <div className="cb-pop-wrap" data-backdrop="1">
          <div className="cb-pop-inner" style={{ "--w": `${width}px` }}>
            <button type="button" className="cb-pop-x" aria-label="Close" onClick={onClose}>✕</button>
            <div className="cb-pop-box">{children}</div>
          </div>
        </div>
      )}
    </dialog>
  );
}

