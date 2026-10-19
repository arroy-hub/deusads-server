"use client";

import { useState } from "react";
import { AccountBody, AccountTabs, BigAv, ConfirmBar, RolePill, RoleSelect, StatusPill, letterOf } from "./account-panel";
import { Lnk } from "./ui";

/** The account popup (mockup userModal): head with the big avatar and pills, the three tabs, role / switch off / delete in the foot. */
export function UserCard({ u, api, onClose }) {
  const [tab, setTab] = useState("profile");
  const [ask, setAsk] = useState(null); // "suspend" | "delete"
  const after = (kind) => { setAsk(null); if (kind === "delete") api.closeAll(); else api.changed(); };

  return (
    <div className="cb-uwrap cb-ucard" data-keep="1">
      <button type="button" className="cb-ucx" aria-label="Close" title="Close" onClick={onClose}>✕</button>
      <div className="cb-box cb-dm">
        <div className="cb-uhead">
          <BigAv id={u.id} url={u.avatarUrl} text={letterOf(u)} size={56} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cb-mute" style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600 }}>Account · admin view</div>
            <div className="cb-unm"><h2>{u.company || "No company name"}</h2><span className="cb-upills"><RolePill role={u.role} /><StatusPill u={u} /></span></div>
            <div className="cb-mute">
              {u.email} · joined {u.joined}
              {u.games.length > 0 && <> · games: {u.games.map((g, i) => <span key={g.id}>{i > 0 && ", "}<Lnk onClick={() => api.open("game", g.id)}>{g.name}</Lnk></span>)}</>}
            </div>
          </div>
        </div>
        <div className="cb-dm-body cb-ubody">
          <AccountTabs tab={tab} setTab={setTab} />
          {u.view ? <AccountBody view={u.view} countries={u.countries} tab={tab} onChanged={api.changed} /> : <div className="cb-upanel cb-mute" style={{ padding: 22 }}>This account could not be read.</div>}
        </div>
        <div className="cb-dm-foot">
          {ask ? <ConfirmBar u={u} kind={ask} onCancel={() => setAsk(null)} onDone={after} /> : (
            <>
              <label className="cb-mute" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>Role<RoleSelect u={u} onChanged={api.changed} /></label>
              <span style={{ flex: 1 }} />
              <button type="button" className="cb-btn cb-q cb-s" disabled={u.self} onClick={() => setAsk("suspend")}>{u.suspended ? "Switch on" : "Switch off"}</button>
              <button type="button" className="cb-btn cb-d cb-s" disabled={u.self} onClick={() => setAsk("delete")}>Delete account…</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
