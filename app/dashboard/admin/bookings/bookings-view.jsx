"use client";

import { useState } from "react";
import { nextSort } from "../../../../lib/sort";
import { STATES, GROUP_BY, groupBookings, bookingSortValue } from "../../../../lib/admin-bookings";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, Icon, IconBtn, Lnk, Pill, SortTh, Th } from "../ui";
import { useCards } from "../cards";

const COLS = "44px minmax(0,1.7fr) 86px 112px 70px";
const SORT_DEFAULTS = { status: "asc", period: "asc", imp: "desc" };
const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US").replace(/,/g, " "));
const dateTxt = (from, to) => `${String(from).slice(5)} → ${to ? String(to).slice(5) : "no end"}`;
const matches = (r, q) => !q || `${r.game}${r.advertiser}${r.developer}${r.creative}${r.campaign}`.toLowerCase().includes(q.toLowerCase());
const stateOk = (r, f) => f === "all" || r.state === f || (f === "rejected" && r.state === "cancelled");
const SHOW = [["all", "All statuses"], ["running", "Running"], ["paused", "Paused by developer"], ["scheduled", "Scheduled"], ["ended", "Ended"]];
const SHOW_EXTRA = [["waiting", "Waiting"], ["rejected", "Rejected or cancelled"]];

export default function BookingsView({ rows, widgets, groups, defaults, layout }) {
  const [filter, setFilter] = useState("all");
  const [by, setBy] = useState("pair");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null);
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const { open: openCard } = useCards();

  const shown = rows.filter((r) => stateOk(r, filter) && matches(r, query));
  const def = GROUP_BY[by];
  const grouped = def.key ? groupBookings(shown, by, sort, (g, k) => bookingSortValue(g, k, true)) : [];
  const sortRowsIn = (list) => {
    if (!sort) return list;
    const sign = sort.dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => { const x = bookingSortValue(a, sort.key), y = bookingSortValue(b, sort.key); return sign * (typeof x === "number" ? x - y : String(x).localeCompare(String(y))); });
  };
  const allOpen = def.key && grouped.length > 0 && grouped.every((g) => openKeys.has(g.key));
  const toggle = (key) => setOpenKeys((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const onSort = (k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS));
  const show = [...SHOW, ...SHOW_EXTRA.filter(([k]) => rows.some((r) => stateOk(r, k)))];

  const press = (fn) => ({ role: "button", tabIndex: 0, onClick: fn, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });

  const Child = ({ r, hide, indent }) => {
    const where = [];
    if (!hide.includes("advertiser")) where.push(r.advertiser);
    if (!hide.includes("developer")) where.push(`→ ${r.developer}`);
    if (!hide.includes("game")) where.push(r.game);
    where.push(r.placement);
    return (
      <div className="cb-lr cb-bkc cb-click" title="Open the booking" style={{ gridTemplateColumns: indent ? COLS.replace("44px", "66px") : COLS, gap: "0 12px" }} {...press(() => openCard("booking", r.id))}>
        <Th seed={r.creativeId ?? r.id} w={40} h={28} tag={r.creative.split(" ")[0]} url={r.creativeUrl} />
        <div className="cb-who"><div>
          <strong>{r.creativeId ? <Lnk onClick={() => openCard("creative", r.creativeId)}>{r.creative}</Lnk> : r.creative}</strong>
          <span className="cb-mute">{where.join(" · ")}</span>
        </div></div>
        <div><Pill tone={STATES[r.state].tone} title={STATES[r.state].label}>{STATES[r.state].short}</Pill></div>
        <div className={`cb-dr${r.state === "paused" ? " cb-paused" : r.state === "ended" ? " cb-over" : ""}`}>
          <b>{dateTxt(r.from, r.to)}</b>
          <div className="cb-tr"><i style={{ width: `${r.state === "scheduled" || r.state === "waiting" ? 0 : r.progress ?? 0}%` }} /></div>
        </div>
        <div className="cb-num cb-mute">{fmt(r.impressions)}</div>
      </div>
    );
  };

  const list = !shown.length ? (
    <div className="cb-list" style={{ padding: 34, textAlign: "center", color: "var(--ink-2)" }}>No bookings match. Clear the search or pick another status.</div>
  ) : (
    <div className="cb-list cb-scroll">
      <div style={{ minWidth: 620 }}>
        <div className="cb-lh" style={{ gridTemplateColumns: COLS, gap: "0 12px" }}>
          <span />
          <span>{def.key ? `${def.label} / creative` : "Creative"}</span>
          <SortTh label="Status" k="status" sort={sort} onSort={onSort} />
          <SortTh label="Period" k="period" sort={sort} onSort={onSort} />
          <span className="cb-num" style={{ textAlign: "right" }}><SortTh label="Impressions" k="imp" sort={sort} onSort={onSort} /></span>
        </div>
        {def.key
          ? grouped.map((g) => {
              const isOpen = Boolean(query) || openKeys.has(g.key);
              return (
                <div key={g.key} className={`cb-bkg${isOpen ? " cb-is-open" : ""}`}>
                  <div className="cb-lr cb-bkh cb-click" aria-expanded={isOpen} style={{ gridTemplateColumns: COLS, gap: "0 12px" }} {...press(() => toggle(g.key))}>
                    <span className={`cb-bkch${isOpen ? " cb-on" : ""}`}><Icon name="chev" size={16} /></span>
                    <div className="cb-who"><div>
                      <strong>{g.title}</strong>
                      <span className="cb-mute">{g.rows.length} booking{g.rows.length > 1 ? "s" : ""}{by === "game" ? "" : ` · ${g.games} game${g.games > 1 ? "s" : ""}`}</span>
                    </div></div>
                    <div className="cb-bkpills">
                      {["running", "paused", "scheduled", "waiting", "ended", "rejected", "cancelled"].filter((k) => g.counts[k]).map((k) => <Pill key={k} tone={STATES[k].tone}>{g.counts[k]} {STATES[k].short.toLowerCase()}</Pill>)}
                    </div>
                    <div className="cb-mute" style={{ fontSize: 12.5 }}>{dateTxt(g.from, g.to)}</div>
                    <div className="cb-num"><b style={{ fontWeight: 600 }}>{fmt(g.impressions)}</b></div>
                  </div>
                  {isOpen && sortRowsIn(g.rows).map((r) => <Child key={r.id} r={r} hide={def.hide} indent />)}
                </div>
              );
            })
          : sortRowsIn(shown).map((r) => <Child key={r.id} r={r} hide={[]} />)}
      </div>
    </div>
  );

  return (
    <>
      <Band icon="bookings" title="All bookings" sub="Read-only. Bookings are grouped, open a group to see its creatives. Bookings approve themselves; to switch an account off, use Users." />
      <DeckShell kind="admin_bookings" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="All bookings, last 90 days. Drag the grip to move a widget.">
        <div className="cb-unit">
          <div className="cb-tbar">
            <Dropdown id="bkst" label="Show" value={filter} onChange={setFilter} options={show} />
            <Dropdown id="bkgroup" label="Group by" value={by} onChange={setBy} options={Object.entries(GROUP_BY).map(([k, g]) => [k, g.label])} />
            <input className="cb-fld" id="bkq" type="search" placeholder="Search game, advertiser, creative" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="cb-trt">
            <span className="cb-mute">{shown.length} of {rows.length}</span>
            {def.key && <IconBtn icon="list" tip="Expand or collapse all" onClick={() => setOpenKeys(allOpen ? new Set() : new Set(grouped.map((g) => g.key)))} />}
            <DeckToggle />
            </span>
          </div>
          {list}
        </div>
      </DeckShell>
    </>
  );
}
