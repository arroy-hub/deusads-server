"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markAllRead, markAttentionSeen, markRead } from "./notifications/actions";

const TABS = [
  { key: "all", label: "All" },
  { key: "action", label: "Needs action" },
  { key: "updates", label: "Updates" },
];

/** "5 h", "2 d" for something recent, "1 Oct" for older. */
function ago(date) {
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return String(date).slice(0, 10);
  const minutes = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 60 / 24)} d`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The bell in the top corner. One place for everything that wants the person's eye: things that need
 * action (an advertiser's rejected creatives, format gaps, limited campaigns, reports) and updates
 * (decisions and bookings). Grouped, with counts, opened by one click; it closes on a click outside,
 * on Escape and when an item is followed. Not a page of its own.
 *
 * It lists only what is unread. Opening a notification (a click anywhere on its row) marks that one as read and it
 * leaves the bell; "Mark all as read" does the same for every notification in the bell and touches nothing else:
 * Recent activity on Home keeps its history. "Needs action" is a notification too: opening an item (a click anywhere on
 * its row) shows the person the problem and the item leaves the bell with the counter going down; it returns only when
 * it changes (lib/attention-seen.js). The Needs attention list on Home is not affected.
 */
export default function NotificationsBell({ items, unread, attention: attentionAll = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("all");
  const [gone, setGone] = useState(() => new Set()); // read in this session, hidden at once, before the server catches up
  const [goneAction, setGoneAction] = useState(() => new Set()); // 'Needs action' items opened in this session, hidden at once
  const box = useRef(null);

  // A fresh list from the server replaces what was hidden by hand.
  useEffect(() => {
    setGone(new Set());
  }, [items, unread]);

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
    setGone(new Set(items.map((item) => item.id)));
    await markAllRead().catch(() => null);
    setBusy(false);
    router.refresh();
  }

  /** A click on a notification: it counts as read and leaves the bell; a link in it is followed. */
  function openOne(item, event) {
    setGone((previous) => new Set(previous).add(item.id));
    markRead(item.id).catch(() => null);
    if (!item.link) return;
    setOpen(false);
    if (!event.target.closest?.("a")) router.push(item.link);
  }

  /** A click on an item of 'Needs action': it is seen, so it leaves the bell; the page it points to is opened. */
  function openAction(item, event) {
    setGoneAction((previous) => new Set(previous).add(item.sig ?? item.key));
    markAttentionSeen(item.sig ?? item.key).catch(() => null);
    setOpen(false);
    if (!event.target.closest?.("a")) router.push(item.href);
  }

  const attention = attentionAll.filter((item) => !goneAction.has(item.sig ?? item.key));
  const list = items.filter((item) => !item.read_at && !gone.has(item.id));
  const unreadNow = Math.max(0, unread - (items.length - list.length));
  const count = attention.length + unreadNow;
  const shown = count > 99 ? "99+" : String(count);
  const showAction = tab !== "updates";
  const showUpdates = tab !== "action";
  const empty = (showAction ? attention.length : 0) + (showUpdates ? list.length : 0) === 0;
  const tabCount = { all: attention.length + list.length, action: attention.length, updates: list.length };

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
            {unreadNow > 0 && (
              <button type="button" className="link-button" onClick={readAll} disabled={busy}>
                {busy ? "Saving…" : "Mark all as read"}
              </button>
            )}
          </div>

          {attention.length + list.length > 0 && (
            <div className="bell-tabs" role="tablist" aria-label="Show">
              {TABS.map((item) => (
                <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className="bell-tab" onClick={() => setTab(item.key)}>
                  {item.label}
                  <span className="bell-tabcount">{tabCount[item.key]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="bell-body">
          {empty && <p className="bell-empty">Nothing new. Decisions on your creatives and bookings show up here.</p>}

          {showAction && attention.length > 0 && (
            <>
              <div className="bell-group">
                Needs action <span>· {attention.length}</span>
              </div>
              <ul className="bell-list">
                {attention.map((item) => (
                  <li
                    key={item.key}
                    className="bell-item"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => openAction(item, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openAction(item, event);
                      }
                    }}
                  >
                    <span className={`bell-icon bell-${item.tone}`} aria-hidden="true">
                      {item.tone === "bad" ? "!" : item.tone === "warn" ? "!" : "i"}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                      <Link href={item.href} className="bell-action">
                        {item.action} →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {showUpdates && list.length > 0 && (
            <>
              {attention.length > 0 && (
                <div className="bell-group">
                  Updates <span>· {list.length}</span>
                </div>
              )}
              <ul className="bell-list">
                {list.map((item) => (
                  <li
                    key={item.id}
                    className="bell-item bell-update is-unread"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => openOne(item, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openOne(item, event);
                      }
                    }}
                  >
                    <div>
                      {item.link ? <Link href={item.link}>{item.text}</Link> : <span>{item.text}</span>}
                    </div>
                    <time className="bell-time" dateTime={String(item.created_at)}>
                      {ago(item.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            </>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
