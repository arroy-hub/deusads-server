"use client";

import { useState } from "react";
import Link from "next/link";
import { nextSort, sortRows } from "../../../../lib/sort";
import { LEVEL_LABEL, LEVEL_RANK } from "../../../../lib/admin-traffic";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, IconBtn, Pill, SortTh } from "../ui";
import { useCards } from "../cards";

const COLS = "minmax(0,1.3fr) 84px 110px minmax(0,1.2fr) 118px 34px";
const SORT_DEFAULTS = { game: "asc", views: "desc", flagged: "desc", mostly: "asc", level: "asc" };
const TONE = { high: "bad", watch: "warn", few: "", ok: "good" };
const FILTERS = [["all", "All games"], ["high", "Look closely"], ["watch", "Worth a look"], ["few", "Too few views"], ["ok", "Fine"]];
const num = (n) => n.toLocaleString("en-US").replace(/,/g, " ");
const percent = (v) => (v > 0 && v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);
const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const href = (days, game) => `/dashboard/admin/traffic?days=${days}${game ? `&game=${game}` : ""}`;

export default function TrafficView({ games, totals, rules, samples, pickedId, days, periods, widgets, groups, defaults, layout }) {
  const { open: openCard } = useCards();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null);
  const [showRules, setShowRules] = useState(false);

  const topRule = (g) => rules.filter((r) => g.rules[r.id] > 0).sort((a, b) => g.rules[b.id] - g.rules[a.id])[0];
  const value = (g, k) => (k === "game" ? g.name : k === "views" ? g.views : k === "flagged" ? g.flagged : k === "mostly" ? topRule(g)?.label ?? "" : LEVEL_RANK[g.level]);
  const q = query.trim().toLowerCase();
  const shown = sortRows(games.filter((g) => (filter === "all" || g.level === filter) && (!q || g.name.toLowerCase().includes(q))), sort, value);
  const picked = pickedId ? games.find((g) => g.id === pickedId) : null;
  const onSort = (k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS));

  return (
    <>
      <Band
        title="Traffic"
        info="Views that look wrong, by game. These are only marks: nothing is hidden or taken off any report, and the numbers developers and advertisers see are the same with or without them. A mark is a reason to look, not proof. Views of a developer's own creatives are never marked."
        sub={`${num(totals.flagged)} of ${num(totals.views)} views marked (${percent(totals.share)}) in the last ${days} days.`}
        actions={<div className="ad-seg" role="group" aria-label="Period">{periods.map((p) => <Link key={p} href={href(p, pickedId)} aria-current={p === days ? "page" : undefined}>{p} days</Link>)}</div>}
      />
      <DeckShell kind="admin_traffic" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="Last period. Drag the grip to move a widget.">
        <div className="ad-unit">
          <div className="ad-bar">
            <Dropdown label="Show" value={filter} onChange={setFilter} options={FILTERS.map(([k, l]) => [k, `${l} (${k === "all" ? games.length : games.filter((g) => g.level === k).length})`])} />
            <input type="search" placeholder="Search game" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="ad-sp" />
            <button type="button" className="ad-btn" aria-expanded={showRules} onClick={() => setShowRules((v) => !v)}>Rules</button>
            <DeckToggle />
          </div>
          {showRules && (
            <div className="ad-panel" style={{ margin: "0 16px 12px" }}>
              {rules.map((r) => <div key={r.id} className="ad-row"><div><b>{r.label}</b></div><div className="ad-mute">{r.hint}</div><div /></div>)}
            </div>
          )}
          {shown.length ? (
            <div className="ad-list" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 640 }}>
                <div className="ad-lh" style={{ gridTemplateColumns: COLS }}>
                  <SortTh label="Game" k="game" sort={sort} onSort={onSort} />
                  <SortTh label="Views" k="views" sort={sort} onSort={onSort} />
                  <SortTh label="Marked" k="flagged" sort={sort} onSort={onSort} />
                  <SortTh label="Mostly" k="mostly" sort={sort} onSort={onSort} />
                  <SortTh label="Verdict" k="level" sort={sort} onSort={onSort} />
                  <span />
                </div>
                {shown.map((g) => (
                  <div key={g.id} className="ad-lr" style={{ gridTemplateColumns: COLS, background: g.id === pickedId ? "#fcf6ef" : undefined }}>
                    <div><strong>{g.flagged > 0 ? <Link className="ad-lnk" href={href(days, g.id)}>{g.name}</Link> : g.name}</strong></div>
                    <div className="ad-mute">{num(g.views)}</div>
                    <div>{num(g.flagged)}{g.flagged > 0 && <span className="ad-mute" style={{ display: "block" }}>{percent(g.share)}</span>}</div>
                    <div className="ad-mute">{topRule(g)?.label ?? "—"}</div>
                    <div><Pill tone={TONE[g.level]} dot={g.level !== "ok"}>{LEVEL_LABEL[g.level]}</Pill></div>
                    <IconBtn icon="list" tip="Open game card" onClick={() => openCard("game", g.id)} />
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="ad-list"><div className="ad-empty">{games.length ? "No games match." : "No views in this period."}</div></div>}
        </div>
      </DeckShell>
      {samples && (
        <div className="ad-unit" style={{ marginTop: 16 }}>
          <div className="ad-bar"><strong>{picked?.name ?? "Game"}: latest marked views</strong></div>
          {samples.length === 0 ? <div className="ad-empty">Nothing marked in this period.</div> : (
            <div className="ad-list" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 760 }}>
                <div className="ad-lh" style={{ gridTemplateColumns: "130px 130px minmax(0,1fr) 70px 110px 130px minmax(0,1.2fr)" }}>
                  <span>Received</span><span>Stamped by the SDK</span><span>Placement</span><span>Seconds</span><span>Distance / angle</span><span>Session / player</span><span>Why</span>
                </div>
                {samples.map((s) => (
                  <div key={s.id} className="ad-lr" style={{ gridTemplateColumns: "130px 130px minmax(0,1fr) 70px 110px 130px minmax(0,1.2fr)", minHeight: 0, fontSize: ".8125rem" }}>
                    <span>{when(s.receivedAt)}</span><span>{when(s.occurredAt)}</span><span>{s.placement ?? "—"}</span><span>{s.seconds ?? "—"}</span>
                    <span>{s.distance == null ? "—" : `${s.distance} m`} / {s.angle == null ? "—" : `${s.angle}°`}</span>
                    <span><code>{String(s.session).slice(0, 12)}</code><span className="ad-mute" style={{ display: "block" }}>{s.player ? String(s.player).slice(0, 12) : "no player ID"}</span></span>
                    <span>{s.rules.map((r) => r.label).join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
