"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import AdminBanner from "./admin-banner";
import NotificationsTab from "./notifications-tab";
import ProfileTab from "./profile-tab";
import SecurityTab from "./security-tab";
import { signOut } from "./actions";
import { leaveDashboard } from "../leave";
import WindowTop, { PlateIcon, PLATE_PATHS } from "../window-top";

const TABS = ["profile", "security", "notifications"];

/**
 * The account page for all three roles. The owner sees it as "Your account"; an admin opening someone
 * else's account from Users sees the same page with the yellow admin strip above it. The tab is kept in
 * the address (?tab=) so a link from an email can open Sign-in & security.
 */
export default function AccountPage({ view, admin = false, countries, initialTab = "profile" }) {
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : "profile");
  const [toast, setToast] = useState("");
  const timer = useRef(null);
  const [signingOut, startSignOut] = useTransition();

  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (text) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2600);
  };
  const open = (next) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "profile") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  const tabs = [["profile", "Profile"], ["security", admin ? "Sign-in" : "Sign-in & security"], ["notifications", "Notifications"]];
  const lede = admin
    ? "Same page the owner sees, with the extra admin controls above."
    : view.role === "advertiser"
      ? "Your company, your login and how we reach you."
      : view.role === "developer"
        ? "Your studio, your login and how we reach you."
        : "Your own admin account.";

  return (
    <div className="gp">
      <WindowTop
        title={admin ? view.company || view.email : "Your account"}
        sub={lede}
        icon={<PlateIcon d={PLATE_PATHS.user} />}
        actions={!admin ? (
          <button type="button" className="button button-quiet" disabled={signingOut} onClick={() => leaveDashboard(() => startSignOut(() => signOut()))}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        ) : null}
      >
        <div className="tabs" role="tablist">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" className="tab" aria-selected={tab === key} aria-current={tab === key ? "page" : undefined} onClick={() => open(key)}>
              {label}
            </button>
          ))}
        </div>
      </WindowTop>

      <div className="gp-work">
        {admin && <AdminBanner view={view} say={say} />}
        {view.schemaOutdated && (
          <p className="notice" role="status">
            The database needs update 0030 before profile details, pictures and notification choices can be saved.
          </p>
        )}
        {tab === "profile" && <ProfileTab view={view} admin={admin} countries={countries} say={say} goSecurity={() => open("security")} />}
        {tab === "security" && <SecurityTab view={view} admin={admin} say={say} />}
        {tab === "notifications" && <NotificationsTab view={view} admin={admin} say={say} goSecurity={() => open("security")} />}
      </div>

      <div className={`toast${toast ? " on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
