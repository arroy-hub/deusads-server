"use client";

import { useRef, useState } from "react";
import { Pop } from "./ui";
import { IcCheck, IcChevron } from "./icons";

/**
 * Building blocks of the filter and view controls: a button that opens a small panel, rows of options inside it,
 * a switch with its explanation, a segmented control and a removable chip. Used by Overview, Campaigns and Creatives.
 */

/** A pill button that opens a panel under it. `count` (number of chosen filters) and `value` (one chosen value) light it up. */
export function PopBtn({ label, value, count = 0, children, width = 260, align = "start", icon }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" className={`fl-btn${count > 0 || value ? " is-on" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon}
        <span>{label}</span>
        {value && <b>{value}</b>}
        {count > 0 && <i className="fl-count">{count}</i>}
        <IcChevron size={12} />
      </button>
      <Pop anchor={ref} open={open} onClose={() => setOpen(false)} width={width} align={align} label={label}>
        <div className="fl-panel">{typeof children === "function" ? children(() => setOpen(false)) : children}</div>
      </Pop>
    </>
  );
}

/** A titled list of options inside a panel. */
export const Group = ({ title, children }) => (
  <div className="fl-group"><div className="fl-gl">{title}</div>{children}</div>
);

/** One choice of a list: a tick in front when chosen, an optional count behind. */
export const Opt = ({ on, onClick, children, count }) => (
  <button type="button" role="menuitemradio" aria-checked={on} className={`fl-opt${on ? " is-on" : ""}`} onClick={onClick}>
    <span className="fl-tick">{on && <IcCheck size={14} />}</span>
    <span className="fl-opt-t">{children}</span>
    {count != null && <small>{count}</small>}
  </button>
);

/** A labelled setting row inside a panel (the control goes below the label). */
export const Field = ({ label, children }) => (
  <div className="fl-field-row"><div className="fl-gl">{label}</div>{children}</div>
);

/** A switch with a title and one line of explanation. Disabled ones explain why in the line. */
export const Switch = ({ on, onChange, disabled, title, hint }) => (
  <div className={`fl-sw-row${disabled ? " is-off" : ""}`}>
    <div className="fl-sw-text"><b>{title}</b><small>{hint}</small></div>
    <button type="button" role="switch" aria-checked={on} aria-label={title} disabled={disabled} className="fl-switch" onClick={() => onChange(!on)}><i /></button>
  </div>
);

/** Segmented control; options are [key, text, disabled?, title?]. `full` stretches it over the width of its panel. */
export const Seg = ({ value, options, onChange, label, full = false }) => (
  <div className={`ovx-seg${full ? " is-full" : ""}`} role="group" aria-label={label}>
    {options.map(([key, text, off, title]) => (
      <button key={key} type="button" aria-pressed={value === key} disabled={off} title={title} onClick={() => onChange(key)}>{text}</button>
    ))}
  </div>
);

/** A chosen filter that can be taken off again. */
export const Chip = ({ children, onRemove }) => (
  <span className="fl-chip">{children}<button type="button" aria-label="Remove filter" onClick={onRemove}>×</button></span>
);
