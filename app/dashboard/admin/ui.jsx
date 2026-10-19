"use client";

import { useEffect, useRef, useState } from "react";
import { ariaSort } from "../../../lib/sort";

// Building blocks of the admin cabinet. Each mirrors a helper of the mockup (claude/admin-mockup-widgets.html):
// ic, th, catPill, band, tabBtn, infoI, statBtn, sel, sth, lnk, toast. Markup and class names are the mockup's, cb-prefixed.

export const ICONS = {
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  dismiss: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  stats: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  book: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4m6-4v4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5" /><path d="M16 4.7a3.5 3.5 0 010 6.6M18 14.8c2 .6 3.3 2.3 3.5 5.2" /></>,
  db: <><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></>,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  bell: <path d="M6 17V11a6 6 0 1112 0v6l1.5 2h-15zM10 21h4" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6.5L20.5 7" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chev: <path d="M9 5l7 7-7 7" />,
  warn: <path d="M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5v.1" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H3" />,
  game: <><rect x="3" y="7" width="18" height="11" rx="4" /><path d="M8 10v5M5.5 12.5h5M16 11.5v.1M18 13.5v.1" /></>,
};

/** The mockup's ic(): a stroked 24px icon sized in px. */
export function Icon({ name, size }) {
  return (
    <svg className="cb-ico" style={size ? { width: size, height: size } : undefined} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** A status label. tone: good | warn | bad | info | (none = grey). */
export function Pill({ tone = "", dot = true, children, title, style }) {
  const cls = ["cb-pill", tone && `cb-${tone}`, !dot && "cb-nodot"].filter(Boolean).join(" ");
  return <span className={cls} title={title} style={style}>{children}</span>;
}

/** Category label: restricted categories are a warning pill with the triangle, others are plain grey. */
export function CatPill({ label, restricted }) {
  return restricted
    ? <span className="cb-pill cb-warn"><Icon name="warn" size={12} /> {label}</span>
    : <span className="cb-pill cb-nodot" style={{ "--t": "#8c7f73" }}>{label}</span>;
}

const GRAD = ["linear-gradient(135deg,#e8643a,#8e2a14)", "linear-gradient(135deg,#2f6f8f,#14344a)", "linear-gradient(135deg,#7b4fb5,#2e1a56)", "linear-gradient(135deg,#2e8b57,#12402a)", "linear-gradient(135deg,#d49a1f,#6e4a05)", "linear-gradient(135deg,#c2397a,#561238)"];
export const gradientFor = (seed) => {
  let h = 0;
  for (const ch of String(seed ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRAD[h % GRAD.length];
};

/**
 * The mockup's thumbnail: a rounded tile with a gradient and the creative's name, or its own picture when it has one.
 * With onClick it is a button (the creative opens).
 */
export function Th({ seed, w, h, tag, url, onClick, label, zoom, style }) {
  const css = { width: w, height: h, background: url ? `center / cover no-repeat url(${url})` : gradientFor(seed), cursor: zoom ? "zoom-in" : undefined, ...style };
  const inner = url ? null : <b>{tag}</b>;
  if (onClick) return <button type="button" className="cb-th" aria-label={label} style={css} onClick={(e) => { e.stopPropagation(); onClick(e); }}>{inner}</button>;
  return <span className="cb-th" style={css}>{inner}</span>;
}

/** A big preview tile (dm-pv, pv): the gradient with the name, or the picture. */
export function BigPv({ seed, tag, url, className = "cb-pv" }) {
  return <div className={className} style={{ background: url ? `center / cover no-repeat url(${url}), #1d1a18` : gradientFor(seed) }}>{url ? null : <b>{tag}</b>}</div>;
}

/** A link-looking button that opens a card (the mockup's lnk()). */
export function Lnk({ onClick, children }) {
  return <button type="button" className="cb-lnk" onClick={(e) => { e.stopPropagation(); onClick(e); }}>{children}</button>;
}

/** An icon-only button: the name shows when it is pointed at or focused (the mockup's .ib). */
export function IconBtn({ icon, tip, danger = false, onClick, disabled = false, pressed, small = false }) {
  return (
    <button type="button" className={`cb-ib${danger ? " cb-d" : ""}${small ? " cb-sm" : ""}`} data-tip={tip} aria-label={tip} aria-pressed={pressed} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick?.(e); }}>
      <Icon name={icon} size={small ? 14 : 16} />
    </button>
  );
}

/** A column title that sorts on a click (the mockup's sth()). */
export function SortTh({ label, k, sort, onSort }) {
  const on = sort?.key === k;
  return (
    <button type="button" className={`cb-th-sort${on ? " cb-on" : ""}`} aria-sort={ariaSort(sort, k)} aria-label={`Sort by ${label}`} onClick={() => onSort(k)}>
      {label}<i>{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</i>
    </button>
  );
}

/** A labelled select in a pill ("Show: All accounts"). options: [[value, label], …] (the mockup's sel()). */
export function Dropdown({ label, value, options, onChange, id }) {
  return (
    <label className="cb-dd" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

/** The segmented control of the toolbars (Open / Action taken / Dismissed with counts). items: [[value, label, count?]]. */
export function Seg({ label, value, items, onChange }) {
  return (
    <div className="cb-seg" role="group" aria-label={label}>
      {items.map(([k, l, n]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}{n != null && <b>{n}</b>}</button>
      ))}
    </div>
  );
}

/**
 * The "i" button with its dark bubble (the mockup's infoI()). Only one is open at a time; a click elsewhere or Escape
 * closes it. `left` puts the bubble's arrow on the left, as in the mockup.
 */
export function Info({ title, text, style }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    const other = (e) => { if (e.detail !== ref.current) setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("cb-info", other);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("cb-info", other); };
  }, [open]);
  const toggle = (e) => {
    e.stopPropagation();
    if (!open) window.dispatchEvent(new CustomEvent("cb-info", { detail: ref.current }));
    setOpen(!open);
  };
  return (
    <span className="cb-mk" ref={ref} style={style}>
      <button type="button" className={`cb-ig-i${open ? " cb-is-on" : ""}`} aria-label={`About: ${title}`} aria-expanded={open} onClick={toggle}>i</button>
      {open && <div className="cb-ig-bubble cb-l" role="tooltip"><span className="cb-ig-bubble-arrow" /><b>{title}</b>{text}</div>}
    </span>
  );
}

/** The button that hides or shows the statistics board (the mockup's statBtn()). */
export function StatBtn({ open, onClick }) {
  const tip = open ? "Hide statistics" : "Show statistics";
  return (
    <button type="button" className="cb-ib" data-tip={tip} aria-label={tip} aria-pressed={open} onClick={onClick}>
      <Icon name="stats" size={16} />
    </button>
  );
}

/** The header band: title with an optional "i" bubble, a one-line subtitle, actions on the right, optional tabs underneath. */
export function Band({ title, info, sub, actions, tabs }) {
  return (
    <div className={`cb-band${tabs ? "" : " cb-nt"}`}>
      <div className="cb-band-row">
        <div>
          <h1>{title}{info && <Info title={title} text={info} />}</h1>
          {sub && <p>{sub}</p>}
        </div>
        <div className="cb-band-act">{actions}</div>
      </div>
      {tabs && <div className="cb-tabs" role="tablist">{tabs}</div>}
    </div>
  );
}

export function Tab({ current, count, onClick, children }) {
  return (
    <button type="button" role="tab" className="cb-tab" aria-current={current ? "page" : undefined} onClick={onClick}>
      {children}
      {count != null && <span className="cb-cnt">{count}</span>}
    </button>
  );
}

/** The mockup's toast(): a dark pill at the bottom of the screen for two seconds. */
export function toast(text) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "cb-toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/**
 * A card over the page: the browser's modal dialog (dims the page, keeps focus inside, Escape closes), centred,
 * a click on the dim area closes it too. The content is only built while open. The card itself (dm, gm, ucard…)
 * brings its own box, as in the mockup.
 */
export function CardPopup({ open, onClose, label, width = 920, children, outside = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); d.focus({ preventScroll: true }); }
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="cb-pop" tabIndex={-1} aria-label={label} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget || e.target.dataset?.backdrop) onClose(); }}>
      {open && (
        <div className="cb-pop-wrap" data-backdrop="1">
          <div className="cb-pop-inner" style={{ "--w": `${width}px` }}>
            {outside && <button type="button" className="cb-pop-x" aria-label="Close" onClick={onClose}>✕</button>}
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
