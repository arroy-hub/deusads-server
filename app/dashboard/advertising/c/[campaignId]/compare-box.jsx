"use client";

import { useState } from "react";
import { formatCount } from "../../../../../lib/analytics";
import { MIN_VIEWS } from "../../../../../lib/campaign-compare";
import GameNameButton, { Bubble } from "./game-name-button";

const PILL = { showing: "live", paused: "paused", category: "paused", blocked: "blocked" };
const pc = (v) => `${Math.round(v * 100)}%`;

// The figures after the share, the same for a creative and for a game. `few` rows show a dash where a share would mislead.
const COLUMNS = [
  { id: "avg", label: "Avg view", tip: "Average time the ad was in view", get: (r) => r.avgVisible, fmt: (v) => `${v.toFixed(1)} s` },
  { id: "engaged", label: "Engaged", tip: "Share of measured views that lasted 3 s or more from within 3 m", get: (r) => r.f.engaged, fmt: pc, share: true },
  { id: "viewable", label: "Viewable", tip: "Share of chances to be seen that lasted long enough to be measured", get: (r) => r.f.viewable, fmt: pc, share: true },
  { id: "players", label: "Players", tip: "Different players who saw the ad", get: (r) => r.f.players, fmt: (v) => formatCount(v) },
  { id: "touched", label: "Touched", tip: "Share of views on interactive objects where the player touched the object", get: (r) => r.f.touched, fmt: pc, share: true },
  { id: "hours", label: "Visible time", tip: "Sum of the time the ad was in view", get: (r) => r.f.hours, fmt: (v) => `${v.toFixed(1)} h` },
  { id: "per", label: "Per player", tip: "How often one player saw the ad", get: (r) => r.f.perPlayer, fmt: (v) => v.toFixed(1), plain: true, share: true },
];

function Th({ id, num, tip, sort, onSort, children, style }) {
  const on = sort?.id === id;
  return (
    <th className={num ? "num" : undefined} title={tip} style={style} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`cr-sort${on ? " is-on" : ""}`} onClick={() => onSort(id)}>
        {children}<span className="cr-arrow" aria-hidden="true">{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function CreativeBubble({ creative, anchor, onClose }) {
  return (
    <Bubble anchor={anchor} label={creative.name} onClose={onClose}>
      <article className="crb">
        <div className="crb-pic">{creative.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={creative.url} alt={creative.name} /> : null}</div>
        <div className="crb-body">
          <h3>{creative.name}</h3>
          <div className="crb-meta"><span>{formatCount(creative.impressions)} views</span><span>{Math.round(creative.share * 100)}% of the campaign</span></div>
          {creative.longer && <span className="ov-pill ov-live">Longer views</span>}
        </div>
      </article>
    </Bubble>
  );
}

/**
 * Creatives and games of one campaign in one table, over the same days. A title sorts the table; a name opens the
 * creative or the game's card. `creatives` and `games` rows carry `f`, their figures from lib/campaign-compare.js.
 */
export default function CompareBox({ creatives, games, emptyCreatives }) {
  const [view, setView] = useState("creative");
  const [open, setOpen] = useState(null); // { row, anchor }
  const [sort, setSort] = useState(null); // { id, dir }
  const isCreative = view === "creative";
  const textual = (id) => id === "name" || id === "label";
  const pickSort = (id) => setSort((cur) => (cur?.id !== id ? { id, dir: textual(id) ? "asc" : "desc" } : cur.dir === "desc" ? { id, dir: "asc" } : cur.dir === "asc" && !textual(id) ? null : cur.dir === "asc" ? { id, dir: "desc" } : null));
  const base = isCreative ? creatives : games;
  const SORT_GET = { name: (r) => r.name.toLowerCase(), label: (r) => r.label ?? "", impressions: (r) => r.impressions, share: (r) => r.share, ...Object.fromEntries(COLUMNS.map((c) => [c.id, c.get])) };
  // a dash sorts last whichever way the table is sorted
  const rows = sort
    ? [...base].sort((x, y) => {
        const a = SORT_GET[sort.id](x), b = SORT_GET[sort.id](y);
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        const d = a < b ? -1 : a > b ? 1 : 0;
        return sort.dir === "asc" ? d : -d;
      })
    : base;
  const best = Object.fromEntries(COLUMNS.map((c) => [c.id, Math.max(...rows.map((r) => c.get(r)).filter((v) => v != null), -Infinity)]));
  const switchTo = (next) => { setView(next); setSort(null); setOpen(null); };
  const anyFew = base.some((r) => r.f.few);

  return (
    <section className="cr-table-box cr-compare" aria-labelledby="cr-compare">
      <div className="cr-box-head cr-pad">
        <div>
          <h2 id="cr-compare">{isCreative ? "Which creative works better" : "Which game works better"}</h2>
          <p className="ovx-hint">{isCreative ? "Creatives rotate, so you can compare them over the same days." : "The same campaign in each game it runs in, over the same days."}</p>
        </div>
        <div className="cr-tabs" role="tablist" aria-label="Compare by">
          <button type="button" role="tab" aria-selected={isCreative} onClick={() => switchTo("creative")}>Creatives <span>{creatives.length}</span></button>
          <button type="button" role="tab" aria-selected={!isCreative} onClick={() => switchTo("game")}>Games <span>{games.length}</span></button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="settings-help cr-pad">{isCreative ? emptyCreatives : "No placements in this campaign yet. Add some on the Placements tab."}</p>
      ) : (
        <div className="ov-table-wrap">
          <table className="cr-cmp">
            <thead>
              <tr>
                <Th id="name" sort={sort} onSort={pickSort}>{isCreative ? "Creative" : "Game"}</Th>
                {!isCreative && <Th id="label" sort={sort} onSort={pickSort}>Status in game</Th>}
                <Th id="impressions" num sort={sort} onSort={pickSort}>Impressions</Th>
                <Th id="share" sort={sort} onSort={pickSort} style={{ width: 100 }}>Share</Th>
                {COLUMNS.map((c) => <Th key={c.id} id={c.id} num tip={c.tip} sort={sort} onSort={pickSort}>{c.label}</Th>)}
                {isCreative && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {isCreative ? (
                    <td className="cr-strong">
                      <span className="cr-gamecell">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.url ? <img className="cr-thumb" src={r.url} alt="" /> : <span className="cr-thumb" />}
                        <button type="button" className="cr-gamelink" aria-haspopup="dialog" aria-expanded={open?.row.id === r.id} onClick={(e) => { const a = e.currentTarget; setOpen(open?.row.id === r.id ? null : { row: r, anchor: a }); }}>{r.name}</button>
                      </span>
                    </td>
                  ) : (
                    <td className="cr-strong"><GameNameButton game={r.card} sub={r.tags || null} /></td>
                  )}
                  {!isCreative && <td><span className={`ov-pill ov-${PILL[r.state] ?? "waiting"}`}>{r.label}</span></td>}
                  <td className="num">{r.impressions > 0 ? formatCount(r.impressions) : "—"}</td>
                  <td><span className="ov-share"><span className="ov-bar-track" aria-hidden="true"><span className="ov-bar-fill" style={{ width: `${Math.round(r.share * 100)}%` }} /></span><span className="num">{Math.round(r.share * 100)}%</span></span></td>
                  {COLUMNS.map((c) => {
                    const v = c.get(r);
                    const why = v == null && c.share && r.f.few ? `Fewer than ${MIN_VIEWS} views, too few to say` : undefined;
                    return <td key={c.id} className={`num${!c.plain && v != null && rows.length > 1 && v === best[c.id] ? " is-best" : ""}`} title={why}>{v == null ? "—" : c.fmt(v)}</td>;
                  })}
                  {isCreative && <td>{r.longer && <span className="ov-pill ov-live">Longer views</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <CreativeBubble creative={open.row} anchor={open.anchor} onClose={() => setOpen(null)} />}
      <p className="ovx-hint cr-pad cr-cmp-note">
        The best figure in each column is marked with a dot. Hover a column title to see what it counts.
        {anyFew ? ` A dash means fewer than ${MIN_VIEWS} views, too few for a share to mean anything.` : ""}
      </p>
    </section>
  );
}
