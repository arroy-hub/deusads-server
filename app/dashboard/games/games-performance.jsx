"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { formatCount } from "../../../lib/analytics";
import { PERIODS, advShare, compactCount, figures, niceTop, ratio } from "../../../lib/performance-view";
import { gamesQuery } from "../../../lib/games-query";
import GameIcon from "../game-icon";
import GamesDeck from "./games-deck";
import KeyNumbers from "../key-numbers";
import { Info } from "../metrics-deck";
import ReportFrame, { StatToggle } from "../advertising/c/[campaignId]/report-frame";

const SOURCE_LABEL = { all: "All impressions", adv: "Advertisers", own: "My creatives" };
const BREAK = [["game", "Game"], ["placement", "Placement"], ["type", "Place type"], ["format", "Format"]];
const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);
const percent = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

const Caret = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * Performance across all games, laid out as in the design: period and filters, the figures, the chart and
 * the table "By game". Period and filters are in the address (the server counts); whose views to show, the
 * search, the grouping and unfolding happen here at once.
 *
 * model: lib/games-performance.js loadGamesPerformance().model
 */
export default function GamesPerformance({ model, deckLayout = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(model.state);
  const [open, setOpen] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [by, setBy] = useState("game");
  const [menu, setMenu] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const [sort, setSort] = useState({ key: "views", dir: "desc" });

  useEffect(() => {
    setState((current) => ({ ...model.state, source: current.source }));
  }, [model]);

  const source = state.source;
  const addressOf = (next) => `${pathname}?${gamesQuery(next)}`;

  function go(patch) {
    const next = { ...state, ...patch };
    setState(next);
    startTransition(() => router.replace(addressOf(next), { scroll: false }));
  }

  function chooseSource(next) {
    setState((current) => ({ ...current, source: next }));
    try {
      window.history.replaceState(window.history.state, "", addressOf({ ...state, source: next }));
    } catch {
      // The address is a convenience: the choice still holds on the page.
    }
  }

  const toggle = (key, value) => {
    const list = state[key];
    go({ [key]: list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value] });
  };

  const kpi = model.kpi.cell;
  const all = kpi.adv + kpi.own;
  const shown = figures(kpi, source);
  const placementTotal = model.rows.reduce((sum, row) => sum + row.placements.length, 0);
  const cards = [
    { id: "all", value: all, sub: `${model.kpi.games} ${model.kpi.games === 1 ? "game" : "games"} · ${placementTotal} ${placementTotal === 1 ? "placement" : "placements"}` },
    { id: "adv", value: kpi.adv, sub: `${Math.round(percent(kpi.adv, all))}% of all` },
    { id: "own", value: kpi.own, sub: `${Math.round(percent(kpi.own, all))}% of all` },
  ];

  // ------------------------------------------------------------ the table
  const needle = query.trim().toLowerCase();
  const table = useMemo(() => {
    const total = (cell) => figures(cell, source).views;
    const sum = (list) => {
      const cell = { ...model.kpi.cell };
      for (const key of Object.keys(cell)) cell[key] = list.reduce((acc, entry) => acc + (entry.cell[key] ?? 0), 0);
      return cell;
    };
    const flat = model.rows.flatMap((row) => row.placements.map((placement) => ({ ...placement, game: row })));
    const matches = (...texts) => !needle || texts.some((text) => String(text).toLowerCase().includes(needle));
    let rows;
    if (by === "game") {
      rows = model.rows
        .map((row) => ({
          id: row.id, name: row.name, game: row, cell: row.cell,
          sub: `${row.placements.length} ${row.placements.length === 1 ? "placement" : "placements"}`,
          kids: row.placements.filter((p) => matches(row.name, p.label)).map((p) => ({ id: p.id, name: p.label, sub: p.format, cell: p.cell })),
        }))
        .filter((row) => matches(row.name) || row.kids.length > 0)
        .map((row) => (matches(row.name) ? { ...row, kids: row.game.placements.map((p) => ({ id: p.id, name: p.label, sub: p.format, cell: p.cell })) } : row));
    } else if (by === "placement") {
      rows = flat.filter((p) => matches(p.label, p.game.name)).map((p) => ({ id: p.id, name: p.label, sub: p.game.name, cell: p.cell, kids: [] }));
    } else {
      const groups = new Map();
      for (const p of flat) {
        const key = by === "type" ? p.type : p.format;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }
      rows = [...groups]
        .map(([key, list]) => ({
          id: `${by}:${key}`, name: key, cell: sum(list), sub: `${list.length} ${list.length === 1 ? "placement" : "placements"}`,
          kids: list.map((p) => ({ id: p.id, name: p.label, sub: p.game.name, cell: p.cell })),
        }))
        .filter((row) => matches(row.name, ...row.kids.map((k) => k.name)));
    }
    const value = {
      name: (item) => String(item.name),
      views: (item) => total(item.cell),
      adv: (item) => item.cell.adv,
      own: (item) => item.cell.own,
      share: (item) => advShare(item.cell),
      sessions: (item) => figures(item.cell, source).sessions,
      avg: (item) => figures(item.cell, source).avgVisible ?? -1,
    }[sort.key];
    const sign = sort.dir === "asc" ? 1 : -1;
    const order = (a, b) =>
      sign * (typeof value(a) === "string" ? value(a).localeCompare(value(b), undefined, { numeric: true }) : value(a) - value(b)) ||
      String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
    rows.sort(order);
    for (const row of rows) row.kids.sort(order);
    const shownCell = sum(rows.length ? rows.map((row) => ({ cell: row.cell })) : []);
    return { rows, shownCell, shownPlacements: by === "game" ? rows.reduce((n, r) => n + r.kids.length, 0) : flat.length };
  }, [model, by, needle, source, sort]);

  // First click: names A–Z, figures biggest first; a second click turns it round.
  function sortBy(key) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  function exportCsv() {
    const lines = [["Name", "Under", "Impressions", "Advertisers", "My creatives", "Sessions", "Avg. visible (s)"]];
    const line = (name, under, cell) => {
      const f = figures(cell, source);
      lines.push([name, under, f.views, cell.adv, cell.own, f.sessions, f.avgVisible == null ? "" : f.avgVisible.toFixed(1)]);
    };
    for (const row of table.rows) {
      line(row.name, "", row.cell);
      for (const kid of row.kids) line(kid.name, row.name, kid.cell);
    }
    const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const blob = new Blob([lines.map((fields) => fields.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `performance-${model.win.from}_${model.win.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ------------------------------------------------------------ the chart
  const days = model.days;
  const showAdv = source !== "own";
  const showOwn = source !== "adv";
  const adv = (day) => (showAdv ? day.adv : 0);
  const own = (day) => (showOwn ? day.own : 0);
  const peak = days.reduce((best, day) => (adv(day) + own(day) > best.v ? { v: adv(day) + own(day), date: day.date } : best), { v: 0, date: null });
  const top = niceTop(peak.v);
  const ticks = [top, (top * 2) / 3, top / 3, 0];
  const pct = (value) => `${(Math.min(value / top, 1) * 100).toFixed(2)}%`;
  const labelAt = [0, 0.25, 0.5, 0.75, 1].map((f) => days[Math.round((days.length - 1) * f)]?.date).filter(Boolean);

  const filters = [
    { key: "games", label: "Games", options: model.gameOptions, all: `All ${model.gameOptions.length}` },
    { key: "types", label: "Place type", options: model.facets.types, all: "All" },
    { key: "formats", label: "Format", options: model.facets.formats, all: "All" },
  ];

  const viewsOf = (day) => (source === "adv" ? day.adv : source === "own" ? day.own : day.adv + day.own);
  let bestDay = null;
  for (const day of model.days) if (viewsOf(day) > (bestDay ? viewsOf(bestDay) : 0)) bestDay = day;
  const hero = {
    value: formatCount(shown.views),
    delta: null,
    tail: `last ${model.win.days} days · ${model.kpi.games} of ${model.kpi.totalGames} ${model.kpi.totalGames === 1 ? "game" : "games"}`,
    perDay: formatCount(Math.round(model.days.length > 0 ? shown.views / model.days.length : 0)),
    bestLabel: "Best day",
    best: bestDay ? `${dayText(bestDay.date)} · ${formatCount(viewsOf(bestDay))}` : "—",
    extra: (
      <div role="group" aria-label="Count views from" className="pf-srcsw">
        {cards.map((card) => (
          <button key={card.id} type="button" aria-pressed={source === card.id} className={`pf-sw ${source === card.id ? "is-on" : ""}`} onClick={() => chooseSource(card.id)}>
            {card.id !== "all" && <span className="gp-key" data-kind={card.id} />}
            {card.id === "all" ? "All" : SOURCE_LABEL[card.id]}
            <b>{formatCount(card.value)}</b>
          </button>
        ))}
        <Info title="Which views to count" text="Select Advertisers or My creatives to count only those views. A view counts when a player had the placement on screen. Per session counts every session of a game, also those in which no ad was seen." />
      </div>
    ),
  };
  const items = [
    { icon: "users", label: "Players", value: shown.players > 0 ? formatCount(shown.players) : "—", sub: shown.players > 0 ? "unique, summed over games" : "needs SDK 0.9 or newer" },
    { icon: "pulse", label: "Per session", value: ratio(shown.perSession), sub: shown.perSession == null ? "needs SDK 0.10 or newer" : "impressions per game session" },
    { icon: "user", label: "Per player", value: ratio(shown.perPlayer), sub: "impressions per player" },
    { icon: "clock", label: "Avg. visible", value: seconds(shown.avgVisible), sub: "per view" },
    { icon: "games", label: "Games", value: String(model.kpi.games), of: `of ${model.kpi.totalGames}`, sub: `${placementTotal} ${placementTotal === 1 ? "placement" : "placements"}` },
    { icon: "eye", label: "Advertiser share", value: all > 0 ? `${Math.round(percent(kpi.adv, all))}%` : "—", sub: "of all impressions" },
  ];

  return (
    <div aria-busy={pending} className={`gp gp-perf ${pending ? "is-pending" : ""}`}>
      <ReportFrame initial={deckLayout} board={<GamesDeck days={state.days} games={state.games} source={source} series={model.days} initial={deckLayout} />}>
      <div className="cr-bar is-wrap">
        <div role="group" aria-label="Period" className="gp-seg">
          {PERIODS.map((n) => (
            <button key={n} type="button" aria-pressed={state.days === n} onClick={() => go({ days: n })}>
              {n} days
            </button>
          ))}
        </div>
        <Info title="Period" text={`Everything below covers the last ${state.days} days.`} />
        {filters.map((filter) => {
          const chosen = state[filter.key];
          return (
            <div key={filter.key} className="gp-filter">
              <button type="button" className="gp-drop" aria-expanded={menu === filter.key} onClick={() => setMenu(menu === filter.key ? null : filter.key)}>
                <span>{filter.label}</span>
                {chosen.length === 0 ? filter.all : `${chosen.length} selected`}
                <Caret />
              </button>
              {menu === filter.key && (
                <div className="gp-menu" role="group" aria-label={filter.label}>
                  {filter.options.length === 0 && <span className="gp-muted">Nothing to pick yet</span>}
                  {filter.options.map((option) => (
                    <label key={option.value} className="gp-option">
                      <input type="checkbox" checked={chosen.includes(option.value)} onChange={() => toggle(filter.key, option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  {chosen.length > 0 && (
                    <button type="button" className="gp-clear" onClick={() => go({ [filter.key]: [] })}>
                      Show all
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <span className="cr-bar-sp" />
        <button type="button" className="cr-ib" data-tip="Export CSV" aria-label="Export CSV" onClick={exportCsv}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
        </button>
        <span className="cr-bar-div" aria-hidden="true" />
        <StatToggle />
      </div>

      <KeyNumbers hero={hero} items={items} />

      <section className="gp-panel" data-fw="1" aria-label="Impressions per day">
        <div className="gp-chart-head">
          <div>
            <h2>Impressions per day</h2>
            <div className="gp-small">
              Last {model.win.days} days · {state.games.length > 0 && state.games.length <= 2 ? model.rows.map((row) => row.name).join(", ") : `${model.kpi.games} of ${model.kpi.totalGames} games`}{peak.v > 0 ? ` · peak ${formatCount(peak.v)} on ${dayText(peak.date)}` : ""}
            </div>
          </div>
          <div className="gp-legend">
            {showAdv && (
              <span><i data-kind="adv" />Advertisers <b>{formatCount(kpi.adv)}</b></span>
            )}
            {showOwn && (
              <span><i data-kind="own" />My creatives <b>{formatCount(kpi.own)}</b></span>
            )}
          </div>
        </div>
        <div className="gp-plot-row">
          <div className="gp-yaxis" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick}>{compactCount(Math.round(tick))}</span>
            ))}
          </div>
          <div className="gp-plot" role="img" aria-label={`Impressions per day, ${formatCount(days.reduce((n, d) => n + adv(d) + own(d), 0))} in total`}>
            {days.map((day) => (
              <div key={day.date} className="gp-bar" title={`${dayText(day.date)}: ${formatCount(adv(day) + own(day))}`}>
                <div style={{ height: pct(own(day)), background: "#3d6fd1", borderRadius: "3px 3px 0 0" }} />
                <div style={{ height: pct(adv(day)), background: "#c94a24", borderRadius: own(day) ? 0 : "3px 3px 0 0" }} />
              </div>
            ))}
          </div>
        </div>
        <div className="gp-xaxis">
          {labelAt.map((date) => (
            <span key={date}>{dayText(date)}</span>
          ))}
        </div>
        <button type="button" className="gp-toggle" aria-expanded={asTable} onClick={() => setAsTable(!asTable)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: asTable ? "rotate(90deg)" : "none" }}>
            <path d="M8 5l10 7-10 7z" />
          </svg>
          Show as table
        </button>
        {asTable && (
          <div className="gp-scroll">
            <table className="gp-table gp-mini">
              <thead>
                <tr><th scope="col">Day</th><th scope="col" className="num">Advertisers</th><th scope="col" className="num">My creatives</th></tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date}><td>{dayText(day.date)}</td><td className="num">{formatCount(day.adv)}</td><td className="num">{formatCount(day.own)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gp-panel gp-tablebox" data-fw="1" aria-label="Table">
        <div className="gp-table-head">
          <h2>By {BREAK.find(([key]) => key === by)[1].toLowerCase()}</h2>
          <div className="gp-tools">
            <label className="gp-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b5f56" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input aria-label="Find a game or placement" placeholder="Find a game or placement" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="gp-by">
              Break down by
              <select value={by} onChange={(e) => { setBy(e.target.value); setOpen(new Set()); }}>
                {BREAK.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="gp-scroll">
          <table className="gp-table">
            <thead>
              <tr>
                <Th id="name" sort={sort} onSort={sortBy}>{BREAK.find(([key]) => key === by)[1]}</Th>
                <Th id="views" num sort={sort} onSort={sortBy}>Impressions</Th>
                <Th id="adv" num sort={sort} onSort={sortBy}>Advertisers</Th>
                <Th id="own" num sort={sort} onSort={sortBy}>My creatives</Th>
                <Th id="share" sort={sort} onSort={sortBy}>Advertiser share</Th>
                <Th id="sessions" num sort={sort} onSort={sortBy}>Sessions</Th>
                <Th id="avg" num last sort={sort} onSort={sortBy}>Avg. visible</Th>
              </tr>
            </thead>
            <tbody>
              <Line total name="All shown" sub={`${table.rows.length} ${by === "game" ? (table.rows.length === 1 ? "game" : "games") : "rows"} · ${table.shownPlacements} ${table.shownPlacements === 1 ? "placement" : "placements"}`} cell={table.shownCell} source={source} />
              {table.rows.map((row) => {
                const expanded = open.has(row.id);
                const empty = row.kids.length === 0;
                return (
                  <Fragment key={row.id}>
                    <Line
                      name={row.name}
                      sub={row.sub}
                      cell={row.cell}
                      source={source}
                      muted={empty && by === "game"}
                      empty={empty && by === "game"}
                      chevron={by !== "placement"}
                      expanded={expanded}
                      disabled={empty}
                      onToggle={() =>
                        setOpen((current) => {
                          const next = new Set(current);
                          next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                          return next;
                        })
                      }
                      tile={by === "game" ? row.game : null}
                      href={by === "game" ? `/dashboard/g/${row.id}?tab=performance` : null}
                    />
                    {expanded &&
                      row.kids.map((kid) => <Line key={kid.id} kid name={kid.name} sub={kid.sub} cell={kid.cell} source={source} />)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {table.rows.length === 0 && <p className="gp-muted" style={{ padding: "12px 20px" }}>Nothing matches.</p>}
      </section>
      </ReportFrame>
    </div>
  );
}

function Th({ id, sort, onSort, num = false, last = false, children }) {
  const on = sort.key === id;
  return (
    <th scope="col" className={`${num ? "num" : ""}${last ? " last" : ""}${on ? " is-sorted" : ""}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="gp-th" onClick={() => onSort(id)}>
        {children}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="gp-arrow" style={{ transform: on && sort.dir === "asc" ? "rotate(180deg)" : "none" }}>
          <path d="M5 8h14l-7 9z" />
        </svg>
      </button>
    </th>
  );
}

function Line({ name, sub, cell, source, total = false, kid = false, chevron = false, expanded = false, disabled = false, muted = false, empty = false, onToggle, tile = null, href = null }) {
  const f = figures(cell, source);
  const share = advShare(cell);
  const dash = (value) => (empty ? "—" : value);
  return (
    <tr className={total ? "is-total" : kid ? "is-kid" : ""} data-muted={muted}>
      <td>
        <div className="gp-name">
          {chevron && (
            <button type="button" className="gp-chev" aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`} aria-expanded={expanded} disabled={disabled} onClick={onToggle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${expanded ? 90 : 0}deg)` }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}
          {tile && <GameIcon name={tile.name} url={tile.iconUrl} size="sm" />}
          <div style={{ minWidth: 0 }}>
            <div className="gp-name-main">{href ? <Link href={href}>{name}</Link> : name}</div>
            <div className="gp-small">{sub}</div>
          </div>
        </div>
      </td>
      <td className="num strong">{dash(formatCount(f.views))}</td>
      <td className="num">{dash(formatCount(cell.adv))}</td>
      <td className="num">{dash(formatCount(cell.own))}</td>
      <td>
        <div className="gp-share">
          <div><i style={{ width: `${empty ? 0 : share.toFixed(1)}%` }} /></div>
          <span>{empty ? "—" : `${Math.round(share)}%`}</span>
        </div>
      </td>
      <td className="num">{dash(formatCount(f.sessions))}</td>
      <td className="num last">{empty ? "—" : seconds(f.avgVisible)}</td>
    </tr>
  );
}
