"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nextSort } from "../../../../lib/sort";
import { LEVEL_LABEL } from "../../../../lib/admin-traffic";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, Info, Pill, Seg, SortTh, gradientFor } from "../ui";
import { useCards } from "../cards";

const COLS = "minmax(0,1.4fr) 68px 68px minmax(0,1fr) 112px";
const SORT_DEFAULTS = { game: "asc", views: "desc", marked: "desc", share: "desc", verdict: "asc" };
const ORDER = { high: 0, watch: 1, ok: 2, few: 3 };
const TONE = { high: "bad", watch: "warn", few: "", ok: "good" };
const FILTERS = [["all", "All games"], ["high", "Look closely"], ["watch", "Worth a look"], ["ok", "Looks normal"], ["few", "Too few views"]];
const num = (n) => n.toLocaleString("en-US").replace(/,/g, " ");
const percent = (v) => (v > 0 && v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);
const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).replace(",", "");
const href = (days, game) => `/dashboard/admin/traffic?days=${days}${game ? `&game=${game}` : ""}`;
const FILL = { high: "#c2391b", watch: "#b87400", ok: "#8c7f73", few: "#8c7f73" };

export default function TrafficView({ games, totals, rules, samples, pickedId, days, periods, widgets, groups, defaults, layout }) {
  const router = useRouter();
  const { open: openCard } = useCards();
  const [pending, go] = useTransition();
  const [want, setWant] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState(null);
  const [allSamples, setAllSamples] = useState(false);

  const value = (g, k) => (k === "game" ? g.name : k === "views" ? g.views : k === "marked" ? g.flagged : k === "share" ? g.share : ORDER[g.level]);
  let shown = games.filter((g) => filter === "all" || g.level === filter);
  shown = [...shown].sort((a, b) => {
    if (!sort) return ORDER[a.level] - ORDER[b.level] || b.share - a.share;
    const x = value(a, sort.key), y = value(b, sort.key), d = sort.dir === "desc" ? -1 : 1;
    return d * (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) || a.name.localeCompare(b.name);
  });
  const picked = games.find((g) => g.id === pickedId) ?? null;
  const look = games.filter((g) => g.level === "high" || g.level === "watch").length;
  const onSort = (k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS));
  const pick = (id) => { setWant(id); go(() => router.replace(href(days, id), { scroll: false })); };
  const press = (fn) => ({ role: "button", tabIndex: 0, onClick: fn, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
  const rows = samples ? (allSamples ? samples : samples.slice(0, 4)) : [];
  const maxRule = Math.max(...rules.map((r) => picked?.rules[r.id] ?? 0), 1);

  return (
    <>
      <Band icon="traffic" title="Traffic" sub="Marks on views that look wrong. Nothing is hidden from any report." />
      <DeckShell kind="admin_traffic" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="Follows the period you pick above. Drag the grip to move a widget.">
        <div className="cb-unit">
          <div className="cb-tbar">
            <Dropdown id="tv" label="Show" value={filter} onChange={setFilter} options={FILTERS.map(([k, l]) => [k, `${l} (${k === "all" ? games.length : games.filter((g) => g.level === k).length})`])} />
            <Seg label="Period" value={days} items={periods.map((p) => [p, `${p} days`])} onChange={(p) => go(() => router.replace(href(p, pickedId), { scroll: false }))} />
            <span className="cb-sp" />
            <div className="cb-tstats" role="group" aria-label="Totals">
              <span><b>{num(totals.views)}</b>views</span>
              <span className="cb-mk"><b>{num(totals.flagged)}</b>marked · {percent(totals.share)}<Info title="Marked views" text={`${num(totals.flagged)} of ${num(totals.views)} views in the last ${days} days broke at least one check: too short on screen, impossible distance or angle, a burst from one session, or no player ID. ${percent(totals.share)} is marked views divided by all views. A mark is a reason to look, not proof; nothing is removed from any report.`} style={{ marginLeft: 0 }} /></span>
              <span><b>{look} of {games.length}</b>games to look at</span>
            </div>
            <DeckToggle />
          </div>
          {shown.length ? (
            <div className="cb-list cb-scroll">
              <div style={{ minWidth: 640 }}>
                <div className="cb-lh" style={{ gridTemplateColumns: COLS, gap: "0 12px" }}>
                  <span><SortTh label="Game" k="game" sort={sort} onSort={onSort} /></span>
                  <span className="cb-num" style={{ textAlign: "right" }}><SortTh label="Views" k="views" sort={sort} onSort={onSort} /></span>
                  <span className="cb-num" style={{ textAlign: "right" }}><SortTh label="Marked" k="marked" sort={sort} onSort={onSort} /></span>
                  <span><SortTh label="Share of views" k="share" sort={sort} onSort={onSort} /></span>
                  <span><SortTh label="Verdict" k="verdict" sort={sort} onSort={onSort} /></span>
                </div>
                {shown.map((g) => (
                  <div key={g.id} className={`cb-lr cb-click cb-cm${g.id === pickedId ? " cb-sel" : ""}${pending && want === g.id ? " cb-busy" : ""}`} aria-busy={pending && want === g.id} style={{ gridTemplateColumns: COLS, gap: "0 12px" }} {...press(() => pick(g.id))}>
                    <div className="cb-who">
                      <button type="button" className="cb-gi cb-gbtn" data-tip="Open game card" aria-label={`Open game card for ${g.name}`} style={{ width: 32, height: 32, fontSize: 13, background: gradientFor(g.id) }} onClick={(e) => { e.stopPropagation(); openCard("game", g.id); }}>{g.name.charAt(0)}</button>
                      <strong>{g.name}</strong>
                    </div>
                    <div className="cb-num">{num(g.views)}</div>
                    <div className="cb-num"><b style={{ fontWeight: 600 }}>{num(g.flagged)}</b></div>
                    <div className="cb-bar" style={{ gridTemplateColumns: "minmax(0,1fr) 40px" }}>
                      <div className="cb-t"><i style={{ width: `${Math.min(100, g.share * 100 * 2.2)}%`, background: FILL[g.level] }} /></div>
                      <b style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{percent(g.share)}</b>
                    </div>
                    <div><Pill tone={TONE[g.level]}>{LEVEL_LABEL[g.level]}</Pill></div>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="cb-list" style={{ padding: 26, textAlign: "center", color: "var(--ink-2)" }}>{games.length ? `No games with this verdict in the last ${days} days.` : "No views in this period."}</div>}
        </div>

        {picked && (
          <div className="cb-panelA cb-sm">
            <h2>Why views were marked</h2>
            <div className="cb-bars cb-sm">
              {rules.map((r) => (
                <div key={r.id} className="cb-bar" title={r.hint}>
                  <span>{r.label}</span>
                  <div className="cb-t"><i style={{ width: `${((picked.rules[r.id] ?? 0) / maxRule) * 100}%` }} /></div>
                  <b className="cb-num" style={{ fontWeight: 600 }}>{num(picked.rules[r.id] ?? 0)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        {picked && samples && (
          <div className="cb-panelA cb-sm">
            <h2>{picked.name}: latest marked views</h2>
            {samples.length === 0 ? <p className="cb-mute" style={{ margin: 0 }}>Nothing marked in this period.</p> : (
              <>
                <div className="cb-scroll">
                  <table className="cb-tt">
                    <thead><tr><th>Received</th><th>Placement</th><th className="cb-r">Seconds</th><th className="cb-r">Distance / angle</th><th>Session / player</th><th>Why</th></tr></thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.id}>
                          <td title="UTC">{when(s.receivedAt)}{Math.abs(Date.parse(s.receivedAt) - Date.parse(s.occurredAt)) > 60000 && <div className="cb-mute">stamped {when(s.occurredAt)}</div>}</td>
                          <td>{s.placement ?? "—"}</td>
                          <td className="cb-r">{s.seconds ?? "—"}</td>
                          <td className="cb-r">{s.distance == null ? "—" : `${s.distance} m`} / {s.angle == null ? "—" : `${s.angle}°`}</td>
                          <td><span className="cb-mono">{String(s.session).slice(0, 12)}</span><div className="cb-mute">{s.player ? String(s.player).slice(0, 12) : "no player ID"}</div></td>
                          <td>{s.rules.map((r) => r.label).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {samples.length > 4 && <div style={{ paddingTop: 10 }}><button type="button" className="cb-btn cb-q cb-s" onClick={() => setAllSamples((v) => !v)}>{allSamples ? "Show only the latest 4" : `Show all ${samples.length}`}</button></div>}
              </>
            )}
          </div>
        )}
      </DeckShell>
    </>
  );
}
