"use client";

import { useEffect, useRef, useState } from "react";
import { IcDownload } from "./_cabinet/icons";

/** One small icon button in the Overview header; its list offers the two CSV files. */
export default function DownloadMenu({ days }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !box.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const base = `/dashboard/advertising/export?days=${days}`;
  return (
    <div className="dl-menu" ref={box}>
      <button type="button" className="dl-button" aria-haspopup="menu" aria-expanded={open} aria-label="Download CSV" title="Download CSV" onClick={() => setOpen((now) => !now)}>
        <IcDownload size={16} />
      </button>
      {open && (
        <div className="dl-list" role="menu">
          <a role="menuitem" href={`${base}&kind=daily`} download onClick={() => setOpen(false)}>By day (CSV)</a>
          <a role="menuitem" href={`${base}&kind=placements`} download onClick={() => setOpen(false)}>By placement (CSV)</a>
        </div>
      )}
    </div>
  );
}
