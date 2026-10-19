"use client";

import { useSyncExternalStore } from "react";
import NavLink from "./nav-link";

// Which part of the platform the admin's side menu shows. Kept in this browser only; it changes the
// menu, not what the account may open.
const KEY = "rail-view";
const ORDER = ["admin", "advertiser", "developer"];
const LABEL = { admin: "Admin", advertiser: "Advertiser", developer: "Developer" };
const listeners = new Set();

function read() {
  try {
    const value = localStorage.getItem(KEY);
    return ORDER.includes(value) ? value : "admin";
  } catch {
    return "admin";
  }
}
function subscribe(fn) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => { listeners.delete(fn); window.removeEventListener("storage", fn); };
}
const useView = () => useSyncExternalStore(subscribe, read, () => "admin");

/** The small role label under the logo: for an admin it is a button that steps through the three views. */
export function RoleSwitch() {
  const view = useView();
  const next = ORDER[(ORDER.indexOf(view) + 1) % ORDER.length];
  const change = () => {
    try { localStorage.setItem(KEY, next); } catch {}
    listeners.forEach((fn) => fn());
  };
  return (
    <button type="button" className="rail-role rail-role-btn" onClick={change} title={`Show the ${LABEL[next]} menu`} aria-label={`Menu view: ${LABEL[view]}. Switch to ${LABEL[next]}`}>
      {LABEL[view]}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg>
    </button>
  );
}

/** The menu groups of the chosen view. */
export function RoleMenu({ views }) {
  const view = useView();
  return (
    <>
      {(views[view] ?? views.admin).map((group, index) => (
        <div className="rail-group" key={`${view}${group.heading ?? index}`}>
          {group.heading && <div className="rail-heading">{group.heading}</div>}
          {group.items.map((item) => <NavLink key={item.key + item.href} item={item} />)}
        </div>
      ))}
    </>
  );
}
