"use client";

import { useEffect, useState } from "react";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, Icon } from "../ui";
import { BigAv, RolePill, StatusPill, letterOf } from "../account-panel";
import { useCards } from "../cards";
import AddUserDialog from "./add-user-dialog";

const COLS = "minmax(0,1.7fr) minmax(0,1fr) 92px 84px 92px 18px";
const FILTERS = [["all", "All accounts"], ["developer", "Developers"], ["advertiser", "Advertisers"], ["admin", "Admins"]];
const SORTS = [["", "Default order"], ["co:1", "Company A–Z"], ["co:-1", "Company Z–A"], ["n:1", "Doing now A–Z"], ["n:-1", "Doing now Z–A"], ["role:1", "Role"], ["role:-1", "Role (reverse)"], ["joined:-1", "Newest first"], ["joined:1", "Oldest first"], ["status:1", "Active first"], ["status:-1", "Inactive first"]];
const ROLE_ORDER = ["admin", "developer", "advertiser"];
const MODE_KEY = "cb-user-mode";

const value = (u, k) => (k === "status" ? (u.suspended ? 2 : u.active ? 0 : 1) : k === "role" ? ROLE_ORDER.indexOf(u.role) : String(k === "co" ? u.company : k === "n" ? u.doing : u[k] ?? "").toLowerCase());

export default function UsersView({ rows, widgets, groups, defaults, layout }) {
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ k: null, d: 1 });
  const [mode, setMode] = useState("popup");
  const { open: openCard } = useCards();
  useEffect(() => { try { setMode(window.localStorage.getItem(MODE_KEY) || "popup"); } catch {} }, []);
  const changeMode = (next) => { setMode(next); try { window.localStorage.setItem(MODE_KEY, next); } catch {} };

  const count = (key) => (key === "all" ? rows.length : rows.filter((r) => r.role === key).length);
  let shown = rows.filter((u) => (role === "all" || u.role === role) && (!query || `${u.company}${u.email}`.toLowerCase().includes(query.toLowerCase())));
  if (sort.k) shown = [...shown].sort((a, b) => { const x = value(a, sort.k), y = value(b, sort.k); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * sort.d || a.email.localeCompare(b.email); });
  const clickSort = (k) => setSort((s) => (s.k === k ? { k, d: -s.d } : { k, d: 1 }));
  const Th = ({ k, label }) => (
    <span><button type="button" className={`cb-th-sort${sort.k === k ? " cb-on" : ""}`} aria-label={`Sort by ${label}`} onClick={() => clickSort(k)}>{label}<i>{sort.k === k ? (sort.d > 0 ? "▲" : "▼") : "↕"}</i></button></span>
  );
  const press = (fn) => ({ role: "button", tabIndex: 0, onClick: fn, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });

  return (
    <>
      <Band icon="users" title="Users" sub="Every account on the platform. Click a row to open it. Active means a game or a campaign is running now." actions={<AddUserDialog />} />
      <DeckShell kind="admin_users" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="All accounts. Drag the grip to move a widget.">
        <div className="cb-unit">
          <div className="cb-tbar">
            <Dropdown id="urole" label="Show" value={role} onChange={setRole} options={FILTERS.map(([k, l]) => [k, `${l} (${count(k)})`])} />
            <Dropdown id="usortsel" label="Sort by" value={sort.k ? `${sort.k}:${sort.d}` : ""} onChange={(v) => setSort(v ? { k: v.split(":")[0], d: +v.split(":")[1] } : { k: null, d: 1 })} options={SORTS} />
            <input className="cb-fld" id="uq" type="search" placeholder="Search company or email" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="cb-sp" />
            <Dropdown id="umode" label="Open account as" value={mode} onChange={changeMode} options={[["page", "Page"], ["popup", "Popup"]]} />
            <DeckToggle />
          </div>
          {shown.length ? (
            <div className="cb-list cb-scroll">
              <div style={{ minWidth: 660 }}>
                <div className="cb-lh" style={{ gridTemplateColumns: COLS, gap: "0 12px" }}>
                  <Th k="co" label="Company" /><Th k="n" label="Doing now" /><Th k="role" label="Role" /><Th k="joined" label="Joined" /><Th k="status" label="Status" /><span />
                </div>
                {shown.map((u) => (
                  <div key={u.id} className="cb-lr cb-click" style={{ gridTemplateColumns: COLS }} {...press(() => openCard("user", u.id))}>
                    <div className="cb-who">
                      <BigAv id={u.id} url={u.avatarUrl} text={letterOf(u)} size={34} />
                      <div><strong>{u.company || "No company name"}{u.self && <> <span className="cb-mute">· You</span></>}</strong><span className="cb-mute">{u.email}</span></div>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{u.doing}</div>
                    <div><RolePill role={u.role} /></div>
                    <div className="cb-mute" style={{ fontSize: 12.5 }}>{u.joined.slice(5).replace("-", "/")}</div>
                    <div><StatusPill u={u} /></div>
                    <span style={{ color: "var(--ink-3)" }}><Icon name="chev" size={16} /></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="cb-list" style={{ padding: 34, textAlign: "center", color: "var(--ink-2)" }}>No accounts match.</div>}
        </div>
      </DeckShell>
    </>
  );
}
