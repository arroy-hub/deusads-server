"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DuplicateButton, PauseButton } from "./campaign-actions";

/** The ⋯ menu of a campaign row. Closes on a click outside and on Escape. */
export default function RowMenu({ id, name, draft = false, paused = false, canPause = false, rules = true }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="cl-menu" ref={box}>
      <button type="button" className="cl-menu-button" aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        ⋯
      </button>
      {open && (
        <div className="cl-menu-list" role="menu" aria-label={`Actions for ${name}`}>
          {draft ? (
            <Link role="menuitem" href={`/dashboard/advertising/new?campaign=${id}`}>
              Continue setup
            </Link>
          ) : (
            <Link role="menuitem" href={`/dashboard/advertising/c/${id}`}>
              Open report
            </Link>
          )}
          <Link role="menuitem" href={`/dashboard/advertising/c/${id}/placements`}>
            Placements
          </Link>
          <Link role="menuitem" href={`/dashboard/advertising/c/${id}/settings`}>
            Settings
          </Link>
          {rules && canPause && (
            <div role="none" className="cl-menu-action">
              <PauseButton id={id} paused={paused} small onDone={() => setOpen(false)} />
            </div>
          )}
          {rules && <DuplicateButton id={id} as="menuitem" onDone={() => setOpen(false)} />}
        </div>
      )}
    </div>
  );
}
