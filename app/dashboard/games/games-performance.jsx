"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { formatCount } from "../../../lib/analytics";
import { PERIODS, advShare, figures } from "../../../lib/performance-view";
import { gamesQuery } from "../../../lib/games-query";
import PerformanceChart from "../g/[gameId]/performance-chart";
import GameIcon from "../game-icon";

const SOURCE_LABEL = { all: "All impressions", adv: "Advertisers", own: "My creatives" };
const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);
const percent = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Performance across all games: the same figures as a game's Performance tab, grouped by game.
 * Period and filters change what the server counts (they live in the address); the choice of whose views
 * to show, the search and unfolding a game happen here at once.
 *
 * model: lib/games-performance.js loadGamesPerformance().model
 */
export default function GamesPerformance({ model }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(model.state);
  const [open, setOpen] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(null);

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
  const cards = [
    { id: "all", value: all, sub: `${model.kpi.games} ${model.kpi.games === 1 ? "game" : "games"}` },
    { id: "adv", value: kpi.adv, sub: `${Math.round(percent(kpi.adv, all))}% of all` },
    { id: "own", value: kpi.own, sub: `${Math.round(percent(kpi.own, all))}% of all` },
  ];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return model.rows
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .map((row) => ({ ...row, views: figures(row.cell, source).views }))
      .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));
  }, [model.rows, query, source]);

  function exportCsv() {
    const lines = [["Game", "Placement", "Impressions", "Advertisers", "My creatives", "Sessions", "Avg. visible (s)"]];
    const line = (game, placement, cell) => {
      const f = figures(cell, source);
      lines.push([game, placement, f.views, cell.adv, cell.own, f.sessions, f.avgVisible == null ? "" : f.avgVisible.toFixed(1)]);
    };
    for (const row of rows) {
      line(row.name, "", row.cell);
      for (const placement of row.placements) line(row.name, placement.label, placement.cell);
    }
    const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const blob = new Blob([lines.map((fields) => fields.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `performance-${model.win.from}_${model.win.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const filters = [
    { key: "games", label: "Games", options: model.gameOptions },
    { key: "types", label: "Place type", options: model.facets.types },
    { key: "formats", label: "Format", options: model.facets.formats },
  ];

  return (
    <div className="pf" aria-busy={pending}>
      <div className={`pf-stack ${pending ? "is-pending" : ""}`}>
        <div className="gp-controls">
          <div className="pf-seg" role="group" aria-label="Period">
            {PERIODS.map((days) => (
              <button key={days} type="button" className="pf-seg-btn" aria-pressed={state.days === days} onClick={() => go({ days })}>
                {days} days
              </button>
            ))}
          </div>
          <span className="pf-bar-label">Show only</span>
          {filters.map((filter) => {
            const chosen = state[filter.key];
            return (
              <div key={filter.key} className="gp-filter">
                <button
                  type="button"
                  className="pf-field"
                  aria-expanded={menu === filter.key}
                  onClick={() => setMenu(menu === filter.key ? null : filter.key)}
                >
                  {filter.label}
                  {chosen.length > 0 ? ` · ${chosen.length}` : ""} ▾
                </button>
                {menu === filter.key && (
                  <div className="gp-menu" role="group" aria-label={filter.label}>
                    {filter.options.length === 0 && <span className="pf-hint">Nothing to pick yet</span>}
                    {filter.options.map((option) => (
                      <label key={option.value} className="gp-option">
                        <input type="checkbox" checked={chosen.includes(option.value)} onChange={() => toggle(filter.key, option.value)} />
                        <span>{option.label}</span>
                        {option.count != null && <span className="pf-hint">{option.count}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {(state.games.length > 0 || state.types.length > 0 || state.formats.length > 0) && (
            <button type="button" className="pf-seg-btn" onClick={() => go({ games: [], types: [], formats: [] })}>
              Clear filters
            </button>
          )}
        </div>

        <section className="pf-panel" aria-label="Figures">
          <div className="pf-kpis" role="radiogroup" aria-label="Which views to count">
            {cards.map((card) => (
              <label key={card.id} className={`pf-src ${source === card.id ? "is-on" : ""}`}>
                <input className="pf-src-input" type="radio" name="gp-source" checked={source === card.id} onChange={() => chooseSource(card.id)} />
                <span className="pf-src-top">
                  <span className={`pf-key ${card.id === "adv" ? "pf-key-adv" : card.id === "own" ? "pf-key-own" : "pf-key-all"}`} aria-hidden="true" />
                  {SOURCE_LABEL[card.id]}
                </span>
                <span className="pf-src-val">{formatCount(card.value)}</span>
                <span className="pf-src-sub">{card.sub}</span>
              </label>
            ))}
            <div className="pf-fig">
              <span className="pf-src-top">Sessions</span>
              <span className="pf-src-val">{formatCount(shown.sessions)}</span>
              <span className="pf-src-sub">summed over games</span>
            </div>
            <div className="pf-fig">
              <span className="pf-src-top">Avg. visible</span>
              <span className="pf-src-val">{seconds(shown.avgVisible)}</span>
              <span className="pf-src-sub">per view</span>
            </div>
          </div>
        </section>

        <PerformanceChart days={model.days} source={source} subtitle={`${model.win.from} – ${model.win.to}`} />

        <section className="pf-panel" aria-label="By game">
          <div className="pf-panel-head">
            <h2>By game</h2>
            <div className="gp-tools">
              <input
                className="pf-field"
                type="search"
                placeholder="Search games"
                aria-label="Search games"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="button" className="pf-seg-btn" onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </div>
          <div className="gp-table-wrap">
            <table className="gp-table">
              <thead>
                <tr>
                  <th scope="col">Game</th>
                  <th scope="col" className="num">Impressions</th>
                  <th scope="col" className="num">Advertisers</th>
                  <th scope="col" className="num">My creatives</th>
                  <th scope="col">Advertiser share</th>
                  <th scope="col" className="num">Sessions</th>
                  <th scope="col" className="num">Avg. visible</th>
                </tr>
              </thead>
              <tbody>
                <tr className="gp-total">
                  <th scope="row">All shown ({rows.length})</th>
                  <Figures cell={kpi} source={source} />
                </tr>
                {rows.map((row) => {
                  const expanded = open.has(row.id);
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <th scope="row">
                          <button
                            type="button"
                            className="gp-fold"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "Hide" : "Show"} placements of ${row.name}`}
                            onClick={() =>
                              setOpen((current) => {
                                const next = new Set(current);
                                next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                                return next;
                              })
                            }
                          >
                            {expanded ? "▾" : "▸"}
                          </button>
                          <GameIcon name={row.name} url={row.iconUrl} size="sm" />
                          <Link href={`/dashboard/g/${row.id}?tab=performance`}>{row.name}</Link>
                          <span className="pf-hint">{row.placements.length} {row.placements.length === 1 ? "placement" : "placements"}</span>
                        </th>
                        <Figures cell={row.cell} source={source} />
                      </tr>
                      {expanded &&
                        row.placements.map((placement) => (
                          <tr key={placement.id} className="gp-kid">
                            <th scope="row">{placement.label}</th>
                            <Figures cell={placement.cell} source={source} />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="pf-hint">No games match.</p>}
        </section>
      </div>
    </div>
  );
}

function Figures({ cell, source }) {
  const f = figures(cell, source);
  const share = advShare(cell);
  return (
    <>
      <td className="num">{formatCount(f.views)}</td>
      <td className="num">{formatCount(cell.adv)}</td>
      <td className="num">{formatCount(cell.own)}</td>
      <td>
        <span className="gp-share" aria-hidden="true">
          <i style={{ width: `${share.toFixed(1)}%` }} />
        </span>{" "}
        <span className="pf-hint">{Math.round(share)}%</span>
      </td>
      <td className="num">{formatCount(f.sessions)}</td>
      <td className="num">{seconds(f.avgVisible)}</td>
    </>
  );
}
