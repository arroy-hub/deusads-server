"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatCount } from "../../../../lib/analytics";
import { BREAKDOWNS, PERIODS, advShare, figures, isFiltered, toQuery } from "../../../../lib/performance-view";
import PerformanceChart from "./performance-chart";

const SOURCE_LABEL = { all: "All impressions", adv: "Advertisers", own: "My pictures" };
const SESSIONS_NOTE = { all: "players who saw an ad", adv: "who saw an advertiser", own: "who saw your pictures" };
const BY_LABEL = Object.fromEntries(BREAKDOWNS);
const FILTER_KEYS = ["folder", "scene", "tag", "type", "format"];

const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);
const count = (value) => formatCount(value);
const percent = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * The Performance tab: how many times ads were shown in the game, and whose they were.
 * The address holds everything that changes what is counted (period, filters, grouping, ticks, one placement);
 * the server answers for it. Choosing which views count (all, advertisers', my pictures), sorting and folding
 * groups need no new answer and happen here at once.
 *
 * model: lib/performance-view.js assembleList() or assembleFocus().
 */
export default function PerformanceTab({ gameId, model, defaultBy }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(model.state);
  const [sort, setSort] = useState({ key: "views", dir: "desc" });
  const [folded, setFolded] = useState(() => new Set());
  const [menu, setMenu] = useState(null);
  const timer = useRef(null);

  // A new answer from the server: take its state, keep the source (it is chosen here, without asking the server).
  useEffect(() => {
    setState((current) => ({ ...model.state, source: current.source }));
  }, [model]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const source = state.source;
  const single = source !== "all";
  const focus = model.mode === "focus";

  const addressOf = (next) => `${pathname}?${toQuery(next, { defaultBy })}`;

  /** Change something the server counts: show it at once, ask for the new figures a moment later. */
  function go(patch, delay = 150) {
    const next = { ...state, ...patch };
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(() => router.replace(addressOf(next), { scroll: false })), delay);
  }

  function chooseSource(next) {
    setState((current) => ({ ...current, source: next }));
    try {
      window.history.replaceState(window.history.state, "", addressOf({ ...state, source: next }));
    } catch {
      // The address is a convenience: the choice still holds on the page.
    }
  }

  // ---------------------------------------------------------------- figures
  const kpi = model.kpi.cell;
  const allViews = kpi.adv + kpi.own;
  const kpiFigures = figures(kpi, source);
  const sourceCards = [
    { id: "all", value: allViews, sub: `${model.kpi.placements} ${model.kpi.placements === 1 ? "placement" : "placements"}` },
    { id: "adv", value: kpi.adv, sub: `${Math.round(percent(kpi.adv, allViews))}% of all` },
    { id: "own", value: kpi.own, sub: `${Math.round(percent(kpi.own, allViews))}% of all` },
  ];

  const scopeText = focus
    ? "1 placement"
    : `${model.kpi.placements} of ${model.totalPlacements} ${model.totalPlacements === 1 ? "placement" : "placements"}`;

  return (
    <div className="pf" aria-busy={pending}>
      <div className={`pf-stack ${pending ? "is-pending" : ""}`}>
        {focus && (
          <>
            <div>
              <button type="button" className="pf-back" onClick={() => go({ focus: "" }, 0)}>
                ← All placements
              </button>
            </div>
            <FocusHead gameId={gameId} placement={model.placement} />
          </>
        )}

        <Controls
          model={model}
          state={state}
          source={source}
          focus={focus}
          menu={menu}
          setMenu={setMenu}
          go={go}
        />

        <section className="pf-panel" aria-label="Figures">
          <div className="pf-kpis" role="radiogroup" aria-label="Which views to count">
            {sourceCards.map((card) => (
              <label key={card.id} className={`pf-src ${source === card.id ? "is-on" : ""}`}>
                <input
                  className="pf-src-input"
                  type="radio"
                  name="pf-source"
                  checked={source === card.id}
                  onChange={() => chooseSource(card.id)}
                />
                <span className="pf-src-top">
                  <span className={`pf-key ${card.id === "adv" ? "pf-key-adv" : card.id === "own" ? "pf-key-own" : "pf-key-all"}`} aria-hidden="true" />
                  {SOURCE_LABEL[card.id]}
                </span>
                <span className="pf-src-val">{count(card.value)}</span>
                <span className="pf-src-sub">{card.sub}</span>
              </label>
            ))}
            <div className="pf-fig">
              <span className="pf-src-top">Sessions</span>
              <span className="pf-src-val">{count(kpiFigures.sessions)}</span>
              <span className="pf-src-sub">{SESSIONS_NOTE[source]}</span>
            </div>
            <div className="pf-fig">
              <span className="pf-src-top">Avg. visible</span>
              <span className="pf-src-val">{seconds(kpiFigures.avgVisible)}</span>
              <span className="pf-src-sub">per view</span>
            </div>
          </div>
          <p className="pf-hint">Click Advertisers or My pictures to count only those views, in the chart and below.</p>
        </section>

        <PerformanceChart
          days={model.chart.days}
          source={source}
          subtitle={`Last ${model.win.days} days · ${scopeText}`}
        />

        {focus ? (
          <FocusPanels model={model} source={source} />
        ) : (
          <TableSection
            model={model}
            state={state}
            source={source}
            sort={sort}
            setSort={setSort}
            folded={folded}
            setFolded={setFolded}
            go={go}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- period, search, filters

function Controls({ model, state, source, focus, menu, setMenu, go }) {
  const facets = focus ? [] : model.facets.filter((facet) => facet.options.length > 1 || state.filters[facet.key].length > 0);
  const filtered = isFiltered(state);
  const valueOf = (option) => (source === "adv" ? option.adv : source === "own" ? option.own : option.adv + option.own);

  const toggle = (key, value) => {
    const chosen = state.filters[key];
    go({ filters: { ...state.filters, [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value] } });
  };
  const clearAll = () => {
    setMenu(null);
    go({ q: "", filters: { folder: [], scene: [], tag: [], type: [], format: [] } }, 0);
  };
  const closeMenu = (key) => {
    setMenu(null);
    document.getElementById(`pf-pill-${key}`)?.focus();
  };

  return (
    <div className="pf-bar">
      <div className="pf-bar-row">
        <div className="pf-seg" role="group" aria-label="Period">
          {PERIODS.map((days) => (
            <button key={days} type="button" className="pf-seg-btn" aria-pressed={state.days === days} onClick={() => go({ days }, 0)}>
              {days} days
            </button>
          ))}
        </div>
        <span className="pf-bar-label">Days are counted in UTC</span>
        {!focus && (
          <div className="pf-search">
            <input
              className="pf-field"
              type="search"
              value={state.q}
              placeholder="Find a placement, scene or tag"
              aria-label="Find a placement, scene or tag"
              onChange={(event) => go({ q: event.target.value }, 350)}
            />
          </div>
        )}
      </div>

      {!focus && (facets.length > 0 || state.ticked.length > 0 || filtered) && (
        <div className="pf-bar-row">
          {facets.length > 0 && <span className="pf-bar-label">Show only</span>}
          {menu && <button type="button" className="pf-scrim" aria-label="Close menu" onClick={() => setMenu(null)} />}
          {facets.map((facet) => {
            const chosen = state.filters[facet.key];
            const open = menu === facet.key;
            const first = facet.options.find((option) => option.value === chosen[0]);
            const text =
              chosen.length === 0 ? facet.label : chosen.length === 1 ? `${facet.label}: ${first?.label ?? chosen[0]}` : `${facet.label}: ${chosen.length} selected`;
            return (
              <span
                key={facet.key}
                className="pf-pill-wrap"
                onKeyDown={(event) => {
                  if (open && event.key === "Escape") closeMenu(facet.key);
                }}
              >
                <span className={`pf-pill-group ${chosen.length > 0 ? "is-set" : ""}`}>
                  <button
                    id={`pf-pill-${facet.key}`}
                    type="button"
                    className="pf-pill pf-pill-menu"
                    aria-haspopup="true"
                    aria-expanded={open}
                    onClick={() => setMenu(open ? null : facet.key)}
                  >
                    {text}
                  </button>
                  {chosen.length > 0 && (
                    <button
                      type="button"
                      className="pf-pill-x"
                      aria-label={`Clear ${facet.label} filter`}
                      onClick={() => {
                        setMenu(null);
                        go({ filters: { ...state.filters, [facet.key]: [] } }, 0);
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
                {open && (
                  <div className="pf-menu" role="group" aria-label={facet.label}>
                    {facet.options.map((option) => (
                      <label key={option.value} className="pf-opt">
                        <input type="checkbox" checked={chosen.includes(option.value)} onChange={() => toggle(facet.key, option.value)} />
                        <span className="pf-opt-name">{option.label}</span>
                        <span className="pf-opt-n">{count(valueOf(option))}</span>
                      </label>
                    ))}
                  </div>
                )}
              </span>
            );
          })}
          {state.ticked.length > 0 && model.ticked.length > 0 && (
            <span className="pf-pill-group is-set">
              <span className="pf-pill pf-pill-static">
                Ticked: {model.ticked.length} {model.ticked.length === 1 ? "placement" : "placements"}
              </span>
              <button type="button" className="pf-pill-x" aria-label="Untick all placements" onClick={() => go({ ticked: [] }, 0)}>
                ×
              </button>
            </span>
          )}
          {filtered && (
            <button type="button" className="link-button" onClick={clearAll}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the table

function TableSection({ model, state, source, sort, setSort, folded, setFolded, go }) {
  const single = source !== "all";
  const { table } = model;
  const grouped = table.by !== "placement";
  const totalViews = figures(table.total.cell, source).views;

  const valueFor = (row, key) => {
    const f = figures(row.cell, source);
    if (key === "views") return f.views;
    if (key === "adv") return row.cell.adv;
    if (key === "own") return row.cell.own;
    if (key === "share") return single ? f.views : advShare(row.cell);
    if (key === "sessions") return f.sessions;
    return f.avgVisible ?? -1;
  };
  const dir = sort.dir === "asc" ? 1 : -1;
  const byName = (a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" });
  const cmp = (a, b) => (sort.key === "name" ? dir * byName(a, b) : dir * (valueFor(a, sort.key) - valueFor(b, sort.key)) || byName(a, b));

  const groups = useMemo(
    () => (grouped ? [...table.groups].sort((a, b) => (a.special !== b.special ? (a.special ? 1 : -1) : a.key === "__unknown" ? 1 : b.key === "__unknown" ? -1 : cmp(a, b))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, source, sort]
  );
  const rows = useMemo(
    () => (grouped ? [] : [...table.rows].sort(cmp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, source, sort]
  );

  const known = new Set((grouped ? groups.flatMap((group) => group.kids) : rows).map((row) => row.id));
  const ticked = state.ticked.filter((id) => known.has(id));
  const tickedSet = new Set(ticked);
  const setTicked = (next) => go({ ticked: next }, 120);
  const toggleTick = (id) => setTicked(tickedSet.has(id) ? ticked.filter((entry) => entry !== id) : [...ticked, id]);

  const sortBy = (key) => setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const nameHead = BY_LABEL[table.by];
  const heads = single
    ? [["name", nameHead, false], ["views", "Impressions", true], ["share", "Share of total", false], ["sessions", "Sessions", true], ["avg", "Avg. visible", true]]
    : [["name", nameHead, false], ["views", "Impressions", true], ["adv", "Advertisers", true, "adv"], ["own", "My pictures", true, "own"], ["share", "Advertiser share", false], ["sessions", "Sessions", true], ["avg", "Avg. visible", true]];
  const cols = single ? "34px minmax(200px, 1fr) 90px 170px 76px 84px" : "34px minmax(200px, 1fr) 84px 84px 84px 150px 76px 84px";

  const note =
    table.by === "tag"
      ? "A placement with several tags is listed under each of them. The total counts every view once."
      : table.by === "scene" || state.filters.scene.length > 0
        ? "Views from before the SDK update do not say which spot they came from, so they are listed under “Location not recorded” and left out when a scene is chosen."
        : "";

  const empty = table.total.placements === 0;
  const allFolded = grouped && groups.length > 0 && groups.every((group) => folded.has(group.key));

  /** The figure cells of one row, in the order of the heads. */
  const figureCells = (cell) => {
    const f = figures(cell, source);
    const sum = cell.adv + cell.own;
    const shareOfTotal = percent(f.views, totalViews);
    return (
      <>
        <div className="pf-cell pf-num pf-strong" role="cell">{count(f.views)}</div>
        {!single && (
          <>
            <div className="pf-cell pf-num" role="cell">{count(cell.adv)}</div>
            <div className="pf-cell pf-num" role="cell">{count(cell.own)}</div>
            <div className="pf-cell pf-tbar" role="cell">
              <span
                className="pf-split"
                role="img"
                aria-label={sum ? `${Math.round(percent(cell.adv, sum))}% advertisers, ${100 - Math.round(percent(cell.adv, sum))}% my pictures` : "No views"}
              >
                {cell.adv > 0 && <span className="pf-split-adv" style={{ width: `${percent(cell.adv, sum).toFixed(2)}%` }} />}
                {cell.own > 0 && <span className="pf-split-own" style={{ width: `${percent(cell.own, sum).toFixed(2)}%` }} />}
              </span>
              <span className="pf-bar-pct">{sum ? `${Math.round(percent(cell.adv, sum))}%` : "—"}</span>
            </div>
          </>
        )}
        {single && (
          <div className="pf-cell pf-tbar" role="cell">
            <span className="pf-split" role="img" aria-label={`${count(f.views)} views, ${Math.round(shareOfTotal)}% of the total`}>
              {f.views > 0 && <span className={`pf-split-one ${source === "adv" ? "pf-split-adv" : "pf-split-own"}`} style={{ width: `${shareOfTotal.toFixed(2)}%` }} />}
            </span>
            <span className="pf-bar-pct">{totalViews ? `${Math.round(shareOfTotal)}%` : "—"}</span>
          </div>
        )}
        <div className="pf-cell pf-num" role="cell">{f.sessions ? count(f.sessions) : "—"}</div>
        <div className="pf-cell pf-num" role="cell">{seconds(f.avgVisible)}</div>
      </>
    );
  };

  const placementRow = (row, indent) => (
    <div key={`${indent ? "k" : "r"}:${row.id}`} className={`pf-row ${row.off ? "is-off" : ""}`} role="row" style={{ gridTemplateColumns: cols }}>
      <div className="pf-cell pf-pick" role="cell">
        <input type="checkbox" checked={tickedSet.has(row.id)} onChange={() => toggleTick(row.id)} aria-label={`Count ${row.label} in the chart`} />
      </div>
      <div className="pf-cell pf-name" role="cell" style={indent ? { paddingLeft: 36 } : undefined}>
        <span className="pf-name-main">
          <span className="pf-name-line">
            <button type="button" className="pf-name-link" onClick={() => go({ focus: row.id }, 0)}>
              {row.label}
            </button>
            {row.shared && <span className="pf-chip">Shared · {row.spots} spots</span>}
            {row.off && <span className="pf-chip pf-chip-off">Off</span>}
          </span>
          <span className="pf-sub-line">{row.sub}</span>
        </span>
      </div>
      {figureCells(row.cell)}
    </div>
  );

  return (
    <section className="pf-panel pf-table-panel" aria-labelledby="pf-table-title">
      <div className="pf-table-head">
        <h2 id="pf-table-title">By {nameHead.toLowerCase()}</h2>
        <div className="pf-table-tools">
          <label className="pf-inline">
            <span>Break down by</span>
            <select
              className="pf-field"
              value={table.by}
              onChange={(event) => {
                setFolded(new Set());
                go({ by: event.target.value }, 0);
              }}
            >
              {BREAKDOWNS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {grouped && groups.length > 0 && (
            <>
              <button type="button" className="link-button" onClick={() => setFolded(new Set())} disabled={folded.size === 0}>
                Expand all
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => setFolded(new Set(groups.filter((group) => !group.special || group.kids.length > 0).map((group) => group.key)))}
                disabled={allFolded}
              >
                Collapse all
              </button>
            </>
          )}
        </div>
      </div>
      {note && <p className="pf-table-note">{note}</p>}

      <div className="pf-scroll">
        <div className="pf-tgrid" role="table" aria-label={`Impressions by ${nameHead.toLowerCase()}`}>
          <div className="pf-row pf-head" role="row" style={{ gridTemplateColumns: cols }}>
            <div className="pf-cell pf-pick" role="columnheader">
              <span className="sr-only">Count in the chart</span>
            </div>
            {heads.map(([key, label, numeric, swatch]) => (
              <div
                key={key}
                className={`pf-cell ${numeric ? "pf-num" : ""}`}
                role="columnheader"
                aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                <button type="button" className="sort-button" onClick={() => sortBy(key)}>
                  {swatch && <span className={`pf-key ${swatch === "adv" ? "pf-key-adv" : "pf-key-own"}`} aria-hidden="true" />}
                  {label}
                  <span className="sort-arrow" aria-hidden="true">
                    {sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </div>
            ))}
          </div>

          {!empty && (
            <div className="pf-row pf-total" role="row" style={{ gridTemplateColumns: cols }}>
              <div className="pf-cell pf-pick" role="cell" />
              <div className="pf-cell pf-name" role="cell">
                <span className="pf-name-main">
                  <span className="pf-name-plain">All shown</span>
                  <span className="pf-sub-line">
                    {table.total.placements} {table.total.placements === 1 ? "placement" : "placements"}
                    {table.total.hasRemoved ? " + removed" : ""}
                  </span>
                </span>
              </div>
              {figureCells(table.total.cell)}
            </div>
          )}

          {grouped &&
            groups.map((group) => {
              const open = !folded.has(group.key);
              const ids = group.kids.map((kid) => kid.id);
              const allTicked = ids.length > 0 && ids.every((id) => tickedSet.has(id));
              const someTicked = ids.some((id) => tickedSet.has(id));
              return (
                <div key={`g:${group.key}`} className="pf-group" role="rowgroup">
                  <div className="pf-row pf-group-row" role="row" style={{ gridTemplateColumns: cols }}>
                    <div className="pf-cell pf-pick" role="cell">
                      <input
                        type="checkbox"
                        checked={allTicked}
                        ref={(element) => {
                          if (element) element.indeterminate = someTicked && !allTicked;
                        }}
                        onChange={() => setTicked(allTicked ? ticked.filter((id) => !ids.includes(id)) : [...new Set([...ticked, ...ids])])}
                        aria-label={`Count everything in ${group.label} in the chart`}
                      />
                    </div>
                    <div className="pf-cell pf-name" role="cell">
                      <button
                        type="button"
                        className="pf-caret"
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${group.label}`}
                        onClick={() =>
                          setFolded((current) => {
                            const next = new Set(current);
                            if (open) next.add(group.key);
                            else next.delete(group.key);
                            return next;
                          })
                        }
                      />
                      <span className="pf-name-main">
                        <span className="pf-name-plain">{group.label}</span>
                        <span className="pf-sub-line">
                          {group.count} {group.count === 1 ? "placement" : "placements"}
                        </span>
                      </span>
                    </div>
                    {figureCells(group.cell)}
                  </div>
                  {open && [...group.kids].sort(cmp).map((kid) => placementRow(kid, true))}
                </div>
              );
            })}

          {!grouped && rows.map((row) => placementRow(row, false))}

          {table.removed && (
            <div className="pf-row pf-removed" role="row" style={{ gridTemplateColumns: cols }}>
              <div className="pf-cell pf-pick" role="cell" />
              <div className="pf-cell pf-name" role="cell">
                <span className="pf-name-main">
                  <span className="pf-name-plain">Removed placements</span>
                  <span className="pf-sub-line">No longer in the game</span>
                </span>
              </div>
              {figureCells(table.removed.cell)}
            </div>
          )}

          {empty && (
            <div className="pf-empty">
              No placements match these filters.{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => go({ q: "", filters: { folder: [], scene: [], tag: [], type: [], format: [] } }, 0)}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- one placement

function FocusHead({ gameId, placement }) {
  return (
    <section className="pf-focus-head" aria-label="Placement">
      <div>
        <h2 className="pf-focus-name">{placement.label}</h2>
        <div className="pf-chips">
          {placement.shared && <span className="pf-chip">Shared · {placement.spots} spots</span>}
          {placement.off && <span className="pf-chip pf-chip-off">Off</span>}
          <span className="pf-chip">{placement.format}</span>
          {placement.folder && <span className="pf-chip">Folder: {placement.folder}</span>}
          {placement.type && <span className="pf-chip">{placement.type}</span>}
          {placement.tags.map((tag) => (
            <span key={tag} className="pf-chip">
              #{tag}
            </span>
          ))}
        </div>
      </div>
      <Link className="pf-open-link" href={`/dashboard/g/${gameId}?tab=placements&placement=${encodeURIComponent(placement.externalId)}`}>
        Open in Placements
      </Link>
    </section>
  );
}

function FocusPanels({ model, source }) {
  const { shown, where } = model;
  const kpi = model.kpi.cell;
  const placementViews = kpi.adv + kpi.own;
  const groups = [
    source !== "own" && {
      id: "adv",
      label: "Advertisers",
      swatch: "pf-key-adv",
      thumb: "pf-thumb-adv",
      total: kpi.adv,
      items: shown.adv,
      empty: "No advertiser was shown here. Only your pictures were.",
    },
    source !== "adv" && {
      id: "own",
      label: "My pictures",
      swatch: "pf-key-own",
      thumb: "pf-thumb-own",
      total: kpi.own,
      items: shown.own,
      empty: "None of your pictures were shown here.",
    },
  ].filter(Boolean);
  const spotViews = (cell) => (source === "adv" ? cell.adv : source === "own" ? cell.own : cell.adv + cell.own);
  const rows = [...where.spots.map((spot) => ({ id: spot.id, name: spot.label, sub: spot.path, cell: spot.cell })), ...(where.unknown ? [{ id: "unknown", name: "Location not recorded", sub: "Views from before the SDK update", cell: where.unknown }] : [])];
  const initials = (name) => name.split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase();

  return (
    <div className="pf-focus-grid">
      <section className="pf-panel" aria-labelledby="pf-shown-title">
        <div className="pf-panel-head">
          <h2 id="pf-shown-title">What was shown</h2>
          <span className="pf-sub">Share of all views of this placement</span>
        </div>
        {groups.map((group) => (
          <div key={group.id} className="pf-cgroup">
            <div className="pf-cgroup-head">
              <span className={`pf-key ${group.swatch}`} aria-hidden="true" />
              <span className="pf-cgroup-name">{group.label}</span>
              <span className="pf-sub">
                {group.items.length} {group.items.length === 1 ? "creative" : "creatives"}
              </span>
              <span className="pf-cgroup-views">{count(group.total)}</span>
              <span className="pf-cgroup-pct">{placementViews ? `${Math.round(percent(group.total, placementViews))}%` : "—"}</span>
            </div>
            {group.items.map((item) => (
              <div key={item.id} className="pf-crow">
                <span className={`pf-thumb ${group.thumb}`} aria-hidden="true">
                  {item.url ? <img src={item.url} alt="" loading="lazy" /> : initials(item.name)}
                </span>
                <span className="pf-cname">
                  <span className="pf-cname-main">{item.name}</span>
                  <span className="pf-sub-line">{item.company}</span>
                </span>
                <span className="pf-num">{count(item.views)}</span>
                <span className="pf-tbar">
                  <span className="pf-split" role="img" aria-label={`${count(item.views)} views, ${Math.round(percent(item.views, placementViews))}% of this placement`}>
                    {item.views > 0 && <span className={`pf-split-one ${group.id === "adv" ? "pf-split-adv" : "pf-split-own"}`} style={{ width: `${percent(item.views, placementViews).toFixed(2)}%` }} />}
                  </span>
                  <span className="pf-bar-pct">{placementViews ? `${Math.round(percent(item.views, placementViews))}%` : "—"}</span>
                </span>
              </div>
            ))}
            {group.items.length === 0 && <p className="pf-empty-line">{group.empty}</p>}
          </div>
        ))}
      </section>

      {rows.length > 0 && (
        <section className="pf-panel" aria-labelledby="pf-where-title">
          <div className="pf-panel-head">
            <h2 id="pf-where-title">Where it stood</h2>
            <span className="pf-sub">One placement, {model.placement.spots} spots in the game</span>
          </div>
          {rows.map((row) => {
            const total = rows.reduce((sum, entry) => sum + entry.cell.adv + entry.cell.own, 0);
            const advW = percent(row.cell.adv, row.cell.adv + row.cell.own);
            return (
              <div key={row.id} className="pf-srow">
                <span className="pf-cname">
                  <span className="pf-cname-main">{row.name}</span>
                  <span className="pf-sub-line">{row.sub}</span>
                </span>
                <span className="pf-num pf-strong">{count(spotViews(row.cell))}</span>
                <span className="pf-tbar">
                  <span className="pf-split" role="img" aria-label={`${Math.round(advW)}% advertisers, ${100 - Math.round(advW)}% my pictures`}>
                    {row.cell.adv > 0 && source !== "own" && <span className="pf-split-adv" style={{ width: `${advW.toFixed(2)}%` }} />}
                    {row.cell.own > 0 && source !== "adv" && <span className="pf-split-own" style={{ width: `${(100 - advW).toFixed(2)}%` }} />}
                  </span>
                  <span className="pf-bar-pct">{total ? `${Math.round(percent(spotViews(row.cell), rows.reduce((sum, entry) => sum + spotViews(entry.cell), 0)))}%` : "—"}</span>
                </span>
              </div>
            );
          })}
          {where.unknown && <p className="pf-note">Older SDK versions do not report the spot, so those views cannot be placed.</p>}
        </section>
      )}
    </div>
  );
}
