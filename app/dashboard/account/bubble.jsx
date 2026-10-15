"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small button with a bubble that opens under it (arrow pointing up, 310px wide). It closes on a click
 * outside, on Escape and from the form's own Cancel. `children` is called with `close` and is only built
 * while the bubble is open, so a closed bubble forgets what was typed.
 */
export default function BubbleButton({ label, children, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="bwrap" ref={box}>
      <button type="button" className="button button-quiet button-small" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open && (
        <div className="bubble" role="dialog" aria-label={ariaLabel ?? label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
