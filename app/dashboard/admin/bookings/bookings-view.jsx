"use client";

import { useState } from "react";
import { nextSort } from "../../../../lib/sort";
import { STATES, STATE_FILTERS, GROUP_BY, groupBookings, bookingSortValue } from "../../../../lib/admin-bookings";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, IconBtn, Pill, SortTh } from "../ui";
import { useCards } from "../cards";

const COLS = "minmax(0,1.5fr) 170px 120px 90px 18px";
const SORT_DEFAULTS = { status: "asc", period: "desc", imp: "desc" };
const PAGE = 20;
const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US").replace(/,/g, " "));
const shortDate = (d) => (d ? d.slice(5).replace("-", "/") : "");
const period = (from, to) => `${shortDate(from)} → ${to ? shortDate(to) : "open"}`;
const matches = (r, q) => !q || `${r.creative} ${r.advertiser} ${r.developer} ${r.game} ${r.placement} ${r.campaign}`.toLowerCase().includes(q);
const stateOk = (r, f) => f === "all" || r.state === f || (f === "rejected" && r.state === "cancelled");

export default function BookingsView({ rows, widgets, groups, defaults, layout }) {
  const [filter, setFilter] = useState("all");
  const [by, setBy] = useState("pair");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null);
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [pages, setPages] = useState(1);
  const { open: openCard } = useCards();

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => stateOk(r, filter) && matches(r, q));
  const def = GROUP_BY[by];
  const grouped = def.key ? groupBookings(shown, by, sort, (g, k) => bookingSortValue(g, k, true)) : [];
  const sortRowsIn = (list) => {
    if (!sort) return [...list].sort((a, b) => STATES[a.state].rank - STATES[b.state].rank || b.createdAt.localeCompare(a.createdAt));
    const sign = sort.dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => { const x = bookingSortValue(a, sort.key), y = bookingSortValue(b, sort.key); return sign * (typeof x === "number" ? x - y : String(x).localeCompare(String(y))); });
  };
  const flat = def.key ? [] : sortRowsIn(shown);
  const visible = def.key ? grouped.slice(0, pages * PAGE) : flat.slice(0, pages * 100);
  const allOpen = def.key && grouped.length > 0 && grouped.every((g) => openKeys.has(g.key));
  const toggle = (key) => setOpenKeys((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const onSort = (k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS));
  const hide = (name) => def.hide.includes(name);

  const line = (r) => {
    const who = [!hide("advertiser") && r.advertiser, !hide("developer") && r.developer].filter(Boolean).join(" → ");
    return [r.placement, !hide("game") && r.game, who].filter(Boolean).join(" · ");
  };
  const Row = ({ r, nested }) => (
    <div className={`ad-lr click${nested ? " ad-nest" : ""}`} role="button" tabIndex={0} style={{ gridTemplateColumns: COLS }} onClick={() => openCard("booking", r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard("booking", r.id); } }}>
      <div className="ad-who">
        <span className="ad-th" style={{ width: 38, height: 38, backgroundImage: r.creativeUrl ? `url(${r.creativeUrl})` : undefined }} />
        <div><strong>{r.creative}</strong><span className="ad-mute">{line(r)}</span></div>
      </div>
      <div><Pill tone={STATES[r.state].tone}>{STATES[r.state].short}</Pill></div>
      <div className="ad-mute">{period(r.from, r.to)}</div>
      <div className="ad-mute" style={{ textAlign: "right" }}>{fmt(r.impressions)}</div>
      <span style={{ color: "var(--ink-3)" }}>›</span>
    </div>
  );

  return (
    <>
      <Band title="All bookings" info="Read-only. Bookings approve themselves and developers decide what shows in their games. Group by pair, developer, advertiser or game to see who works with whom; groups with paused bookings come first." sub="Every booking on the platform. Click a row to open it." />
      <DeckShell kind="admin_bookings" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="All bookings. Drag the grip to move a widget.">
        <div className="ad-unit">
          <div className="ad-bar">
            <Dropdown label="Show" value={filter} onChange={(v) => { setFilter(v); setPages(1); }} options={STATE_FILTERS.map(([k, l]) => [k, `${l} (${rows.filter((r) => stateOk(r, k)).length})`])} />
            <Dropdown label="Group by" value={by} onChange={(v) => { setBy(v); setPages(1); }} options={Object.entries(GROUP_BY).map(([k, g]) => [k, g.label])} />
            <input type="search" placeholder="Search creative, game or company" aria-label="Search" value={query} onChange={(e) => { setQuery(e.target.value); setPages(1); }} />
            <span className="ad-sp" />
            <span className="ad-mute">{shown.length} of {rows.length}</span>
            {def.key && <IconBtn tip={allOpen ? "Collapse all groups" : "Expand all groups"} onClick={() => setOpenKeys(allOpen ? new Set() : new Set(grouped.map((g) => g.key)))} icon={allOpen ? "collapse" : "expand"} />}
            <DeckToggle />
          </div>
          {shown.length ? (
            <div className="ad-list" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 640 }}>
                <div className="ad-lh" style={{ gridTemplateColumns: COLS }}>
                  <span>{def.key ? def.label : "Booking"}</span>
                  <SortTh label="Status" k="status" sort={sort} onSort={onSort} />
                  <SortTh label="Period" k="period" sort={sort} onSort={onSort} />
                  <SortTh label="Impressions" k="imp" sort={sort} onSort={onSort} />
                  <span />
                </div>
                {def.key ? visible.map((g) => {
                  const isOpen = openKeys.has(g.key);
                  const items = sortRowsIn(g.rows);
                  return (
                    <div key={g.key}>
                      <div className="ad-lr click" role="button" tabIndex={0} aria-expanded={isOpen} style={{ gridTemplateColumns: COLS, background: "var(--surface-2, #faf6f1)" }} onClick={() => toggle(g.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(g.key); } }}>
                        <div className="ad-who"><div><strong>{isOpen ? "▾" : "▸"} {g.title}</strong><span className="ad-mute">{g.rows.length} booking{g.rows.length === 1 ? "" : "s"} · {g.games} game{g.games === 1 ? "" : "s"}</span></div></div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{Object.entries(g.counts).sort((a, b) => STATES[a[0]].rank - STATES[b[0]].rank).map(([s, n]) => <Pill key={s} tone={STATES[s].tone} dot={false}>{n} {STATES[s].short.toLowerCase()}</Pill>)}</div>
                        <div className="ad-mute">{period(g.from, g.to)}</div>
                        <div className="ad-mute" style={{ textAlign: "right" }}>{fmt(g.impressions)}</div>
                        <span />
                      </div>
                      {isOpen && items.map((r) => <Row key={r.id} r={r} nested />)}
                    </div>
                  );
                }) : visible.map((r) => <Row key={r.id} r={r} />)}
              </div>
              {(def.key ? grouped.length : flat.length) > visible.length && <div style={{ padding: 12, textAlign: "center" }}><button type="button" className="ad-btn" onClick={() => setPages((p) => p + 1)}>Show more</button></div>}
            </div>
          ) : <div className="ad-list"><div className="ad-empty">No bookings match.</div></div>}
        </div>
      </DeckShell>
    </>
  );
}
