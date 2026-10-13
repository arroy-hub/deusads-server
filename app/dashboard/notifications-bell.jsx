"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markAllRead } from "./notifications/actions";

const TABS = [
  { key: "all", label: "All" },
  { key: "action", label: "Needs action" },
  { key: "updates", label: "Updates" },
];

/**
 * The bell in the top corner. One place for everything that wants the person's eye: things that need
 * action (an advertiser's rejected creatives, format gaps, limited campaigns, reports) and updates
 * (decisions and bookings). Grouped, with counts, opened by one click; it closes on a click outside,
 * on Escape and when an item is followed. Not a page of its own.
 */
export default function NotificationsBell({ items, unread, attention = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("all");
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

  const count = attention.length + unread;
  const shown = count > 99 ? "99+" : String(count);
  const showAction = tab !== "updates";
  const showUpdates = tab !== "action";
  const empty = (showAction ? attention.length : 0) + (showUpdates ? items.length : 0) === 0;
  const tabCount = { all: attention.length + items.length, action: attention.length, updates: items.length };

  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className="bell-button"
        aria-label={count > 0 ? `Notifications, ${count} to look at` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0112 0c0 7 3 7 3 9H3c0-2 3-2 3-9M10 21h4" />
        </svg>
        {count > 0 && <span className="bell-badge">{shown}</span>}
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

          {attention.length > 0 && (
            <div className="bell-tabs" role="tablist" aria-label="Show">
              {TABS.map((item) => (
                <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className="bell-tab" onClick={() => setTab(item.key)}>
                  {item.label}
                  <span className="bell-tabcount">{tabCount[item.key]}</span>
                </button>
              ))}
            </div>
          )}

          {empty && <p className="bell-empty">Nothing yet. Decisions on your creatives and bookings show up here.</p>}

          {showAction && attention.length > 0 && (
            <>
              <div className="bell-group">
                Needs action <span>· {attention.length}</span>
              </div>
              <ul className="bell-list">
                {attention.map((item) => (
                  <li key={item.key} className="bell-item">
                    <span className={`bell-icon bell-${item.tone}`} aria-hidden="true">
                      {item.tone === "bad" ? "!" : item.tone === "warn" ? "!" : "i"}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                      <Link href={item.href} className="bell-action" onClick={() => setOpen(false)}>
                        {item.action} →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {showUpdates && items.length > 0 && (
            <>
              {attention.length > 0 && (
                <div className="bell-group">
                  Updates <span>· {items.length}</span>
                </div>
              )}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
