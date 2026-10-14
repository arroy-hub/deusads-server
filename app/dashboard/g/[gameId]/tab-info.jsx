"use client";

import { useRef, useState } from "react";
import { Pop } from "../../_cabinet/ui";

/** A small "i" at the end of the tab bar: tap it and the description of the open tab appears in a bubble. */
export default function TabInfo({ text, label }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <>
      <button ref={btn} type="button" className="tab-info" aria-label={`About ${label}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7.2v4" />
          <circle cx="8" cy="4.8" r="0.5" fill="currentColor" />
        </svg>
      </button>
      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={320} label={`About ${label}`}>
        <p className="tab-info-text">{text}</p>
      </Pop>
    </>
  );
}
