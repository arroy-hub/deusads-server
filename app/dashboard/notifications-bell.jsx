"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markAllRead } from "./notifications/actions";

/**
 * The bell in the top corner: the number of unread notifications and, on click, a small panel
 * with the latest ones. It closes on a click outside, on Escape and when a notification is
 * followed. Not a page of its own.
 */
export default function NotificationsBell({ items, unread }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  async function readAll() {
    setBusy(true);
    await markAllRead().catch(() => null);
    setBusy(false);
    router.refresh();
  }

  const shown = unread > 99 ? "99+" : String(unread);

  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className="bell-button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0112 0c0 7 3 7 3 9H3c0-2 3-2 3-9M10 21h4" />
        </svg>
        {unread > 0 && <span className="bell-badge">{shown}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="link-button" onClick={readAll} disabled={busy}>
                {busy ? "Saving…" : "Mark all as read"}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">Nothing yet. Decisions on your creatives and bookings show up here.</p>
          ) : (
            <ul className="bell-list">
              {items.map((item) => (
                <li key={item.id} className={item.read_at ? "" : "is-unread"}>
                  {item.link ? (
                    <Link href={item.link} onClick={() => setOpen(false)}>
                      {item.text}
                    </Link>
                  ) : (
                    <span>{item.text}</span>
                  )}
                  <time className="muted-line">{String(item.created_at).slice(0, 10)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
