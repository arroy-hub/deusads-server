"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccountBody, AccountTabs, ConfirmBar, RolePill, RoleSelect, StatusPill, tabOf } from "../../account-panel";
import { Band, Icon } from "../../ui";

/** Someone else's account as a page (mockup userA): the admin bar, the band with pills and role, the three tabs. */
export default function AdminAccountPage({ u, initialTab }) {
  const router = useRouter();
  const [tab, setTabState] = useState(tabOf(initialTab));
  const [more, setMore] = useState(false);
  const [ask, setAsk] = useState(null);
  const setTab = (next) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "profile") url.searchParams.delete("tab"); else url.searchParams.set("tab", next === "notif" ? "notifications" : next);
    window.history.replaceState(null, "", url);
  };
  const refresh = () => router.refresh();
  const after = (kind) => { setAsk(null); if (kind === "delete") router.push("/dashboard/admin/users"); else refresh(); };
  const menu = { position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 12px 36px rgba(36,29,25,.18)", padding: 6, display: "grid", minWidth: 210, zIndex: 5 };

  return (
    <>
      <div className="cb-adminbar"><Icon name="warn" size={14} /> Admin view of this account. The owner sees the same page without this bar.</div>
      <Band
        icon="users"
        title={u.company || u.email}
        sub={`${u.email} · joined ${u.joined}`}
        actions={
          <>
            <RolePill role={u.role} />
            <StatusPill u={u} />
            <RoleSelect u={u} onChanged={refresh} />
            <span style={{ position: "relative" }}>
              <button type="button" className="cb-btn cb-q" aria-expanded={more} onClick={() => setMore((v) => !v)}>Account actions ▾</button>
              {more && (
                <div style={menu}>
                  <button type="button" className="cb-btn cb-q" style={{ border: 0, justifyContent: "flex-start" }} disabled={u.self} onClick={() => { setMore(false); setAsk("suspend"); }}>{u.suspended ? "Switch on" : "Switch off"}</button>
                  <button type="button" className="cb-btn cb-d" style={{ border: 0, justifyContent: "flex-start" }} disabled={u.self} onClick={() => { setMore(false); setAsk("delete"); }}>Delete account…</button>
                </div>
              )}
            </span>
          </>
        }
      />
      <div className="cb-work">
        {ask && <div style={{ display: "flex", marginBottom: 14 }}><ConfirmBar u={u} kind={ask} onCancel={() => setAsk(null)} onDone={after} /></div>}
        <AccountTabs tab={tab} setTab={setTab} />
        {u.view ? <AccountBody view={u.view} countries={u.countries} tab={tab} onChanged={refresh} /> : <div className="cb-upanel cb-mute" style={{ padding: 22 }}>This account could not be read.</div>}
      </div>
    </>
  );
}
