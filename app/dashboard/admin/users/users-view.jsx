"use client";

import { useState } from "react";
import { nextSort, sortRows } from "../../../../lib/sort";
import { userSortValue } from "../../../../lib/admin-users";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, Pill, SortTh } from "../ui";
import { useCards } from "../cards";
import AddUserDialog from "./add-user-dialog";

const ROLE_NAME = { developer: "Developer", advertiser: "Advertiser", admin: "Admin" };
const COLS = "minmax(0,1.7fr) minmax(0,1fr) 96px 78px 100px 18px";
const SORT_DEFAULTS = { company: "asc", doing: "asc", role: "asc", joined: "desc", status: "asc" };
const FILTERS = [["all", "All accounts"], ["developer", "Developers"], ["advertiser", "Advertisers"], ["admin", "Admins"]];

const statusPill = (u) => (u.suspended ? <Pill tone="warn">Switched off</Pill> : u.active ? <Pill tone="good">Active</Pill> : <Pill dot={false}>Inactive</Pill>);
const rolePill = (role) => <Pill tone={role === "admin" ? "info" : ""} dot={false}>{ROLE_NAME[role]}</Pill>;
const initial = (u) => (u.company || u.email).trim().charAt(0).toUpperCase();

function Avatar({ u, size = 34 }) {
  return <span className="ad-av" style={{ width: size, height: size, fontSize: size * 0.4, backgroundImage: u.avatarUrl ? `url(${u.avatarUrl})` : undefined }}>{u.avatarUrl ? "" : initial(u)}</span>;
}

export default function UsersView({ rows, widgets, groups, defaults, layout }) {
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null);
  const { open: openCard } = useCards();

  const count = (key) => (key === "all" ? rows.length : rows.filter((r) => r.role === key).length);
  const q = query.trim().toLowerCase();
  const shown = sortRows(rows.filter((r) => (role === "all" || r.role === role) && (!q || `${r.company} ${r.email}`.toLowerCase().includes(q))), sort, userSortValue);

  return (
    <>
      <Band title="Users" sub="Every account on the platform. Click a row to open it. Active means a game or a campaign is running now." actions={<AddUserDialog />} />
      <DeckShell kind="admin_users" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="All accounts. Drag the grip to move a widget.">
        <div className="ad-unit">
          <div className="ad-bar">
            <Dropdown label="Show" value={role} onChange={setRole} options={FILTERS.map(([k, l]) => [k, `${l} (${count(k)})`])} />
            <input type="search" placeholder="Search company or email" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="ad-sp" />
            <span className="ad-mute">{shown.length} of {rows.length}</span>
            <DeckToggle />
          </div>
          {shown.length ? (
            <div className="ad-list" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 660 }}>
                <div className="ad-lh" style={{ gridTemplateColumns: COLS }}>
                  <SortTh label="Company" k="company" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS))} />
                  <SortTh label="Doing now" k="doing" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS))} />
                  <SortTh label="Role" k="role" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS))} />
                  <SortTh label="Joined" k="joined" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS))} />
                  <SortTh label="Status" k="status" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS))} />
                  <span />
                </div>
                {shown.map((u) => (
                  <div key={u.id} className="ad-lr click" role="button" tabIndex={0} style={{ gridTemplateColumns: COLS }} onClick={() => openCard("user", u.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard("user", u.id); } }}>
                    <div className="ad-who">
                      <Avatar u={u} />
                      <div><strong>{u.company || "No company name"}{u.self && <span className="ad-mute"> · You</span>}</strong><span className="ad-mute">{u.email}</span></div>
                    </div>
                    <div style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>{u.doing}</div>
                    <div>{rolePill(u.role)}</div>
                    <div className="ad-mute">{u.joined.slice(5).replace("-", "/")}</div>
                    <div>{statusPill(u)}</div>
                    <span style={{ color: "var(--ink-3)" }}>›</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="ad-list"><div className="ad-empty">No accounts match.</div></div>}
        </div>
      </DeckShell>
    </>
  );
}

