"use client";

import Link from "next/link";
import CategoryIcon from "./advertising/category-icon";
import StatusPill from "./advertising/status-pill";
import { categoryLabel } from "../../lib/categories";
import { useMemo, useRef, useState } from "react";
import { formatCount, formatDay, niceMax } from "../../lib/analytics";
import { deltaText } from "../../lib/advertiser-overview";
import { byDay, byWeek, chartEvents, colorOf, dashOf, mergeSplit, selectionTotals, sortCampaigns, spreadLabels, sumSeries, weekdayDay } from "../../lib/overview-chart";

const W = 720;
const H = 240;
const BREAKDOWNS = [
  ["total", "Total"],
  ["campaign", "Campaign"],
  ["creative", "Creative"],
  ["game", "Game"],
  ["format", "Format"],
];
const BREAKDOWN_TEXT = { total: "all selected campaigns", campaign: "by campaign", creative: "by creative", game: "by game", format: "by format" };
const EVENT_COLOR = { live: "#1c1b1a", paused: "#1c1b1a", blocked: "#8a2c17" };

/** A lighter tint of a colour, for text on the dark tooltip. */
function tint(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.55);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** "+0.4 s" / "−0.2 s" against the period before, or null. */
function deltaSeconds(now, before) {
  if (now == null || before == null) return null;
  const change = Math.round((now - before) * 10) / 10;
  if (change === 0) return { text: "no change", tone: "flat" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} s`, tone: change > 0 ? "up" : "down" };
}

/**
 * The Overview's working part, as in the approved mockup: the numbers, the impressions chart and the
 * "By campaign" table, all driven by the campaigns ticked in the table. The chart breaks the numbers
 * down by campaign, creative, game or format (the last three need migration 0027), per day or per week,
 * with the pauses and blocks marked on it; Total can be compared with the period before.
 */
export default function OverviewExplorer({ days, dates, campaigns, previous = null, splitMissing = false }) {
  // Ticked at the start: campaigns that show something (impressions, a mark, running). With none of those, all of them.
  const [selected, setSelected] = useState(() => {
    const active = campaigns.filter((item) => item.impressions > 0 || item.daily.some(Boolean) || (item.events ?? []).length > 0 || ["live", "limited"].includes(item.status?.key));
    return new Set((active.length > 0 ? active : campaigns).map((item) => item.id));
  });
  const [breakdown, setBreakdown] = useState("campaign");
  const [grain, setGrain] = useState("day");
  const [compare, setCompare] = useState(false);
  const [marks, setMarks] = useState(true);
  const [sort, setSort] = useState({ key: "impressions", dir: "desc" });
  const [hover, setHover] = useState(null);
  const plot = useRef(null);

  const compareOn = compare && breakdown === "total";
  const pickBreakdown = (key) => { setBreakdown(key); if (key !== "total") setCompare(false); };
  const colorFor = useMemo(() => new Map(campaigns.map((item, index) => [item.id, colorOf(index)])), [campaigns]);
  const chosen = campaigns.filter((item) => selected.has(item.id));
  const totals = selectionTotals(chosen);
  const allOn = chosen.length === campaigns.length;
  const hasSplit = !splitMissing && campaigns.some((item) => item.split);

  const bucket = grain === "week" ? (values) => byWeek(values, dates) : (values) => byDay(values, dates);
  const lines = useMemo(() => {
    const make = (list) => list.map((item, index) => ({ id: item.key ?? item.id, name: item.name, color: item.color ?? colorOf(index), dash: dashOf(index), points: bucket(item.daily) }));
    if (breakdown === "campaign") return chosen.map((item) => ({ id: item.id, name: item.name, color: colorFor.get(item.id), dash: dashOf(campaigns.indexOf(item)), points: bucket(item.daily) }));
    if (breakdown === "total") {
      const list = [{ id: "total", name: "All selected", color: "#1c1b1a", dash: undefined, points: bucket(sumSeries(chosen.map((item) => item.daily), days)) }];
      if (compare) {
        const before = bucket(sumSeries(chosen.map((item) => item.previousDaily), days)).map((point, index) => ({ ...point, date: list[0].points[index]?.date ?? point.date }));
        list.push({ id: "previous", name: `Previous ${days} days`, color: "#9a948b", dash: "7 4", points: before });
      }
      return list;
    }
    return make(mergeSplit(chosen.map((item) => item.split), breakdown, days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown, grain, compare, selected, campaigns]);

  // A breakdown with nothing to draw (campaigns without impressions) still has its days on the axis.
  const axis = lines[0]?.points ?? bucket(Array.from({ length: dates.length }, () => 0));
  const count = axis.length;
  const peak = Math.max(0, ...lines.flatMap((line) => line.points.map((point) => point.value)));
  const top = niceMax(peak);
  const x = (index) => (count > 1 ? (index / (count - 1)) * W : W / 2);
  const y = (value) => H - (value / top) * H;
  const label = (point) => (grain === "week" ? `${formatDay(point.date)} – ${formatDay(point.to)}` : weekdayDay(point.date));

  // Names at the line ends, kept apart from one another.
  const ends = spreadLabels(lines.map((line) => y(line.points[count - 1]?.value ?? 0) - 8), 16, H - 16);

  // Pauses, blocks and starts of the ticked campaigns, each in the bucket its day falls in.
  const events = marks
    ? chartEvents({ campaigns: chosen, dates }).map((event) => {
        const day = dates.indexOf(event.date);
        const position = grain === "week" ? Math.floor(day / 7) : day;
        return { ...event, at: count > 1 ? (position / (count - 1)) * 100 : 50, text: `${formatDay(event.date)} · ${event.label}` };
      })
    : [];
  // Names of the marks sit under the axis; a name that would run into the previous one drops to the next row.
  const rowEnds = [];
  const placed = events.map((event) => {
    const width = event.text.length * 6.4 + 14;
    const left = (event.at / 100) * 880 - width / 2;
    let row = rowEnds.findIndex((end) => left > end + 6);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = left + width;
    return { ...event, row };
  });
  const rows = Math.max(1, rowEnds.length);

  function move(event) {
    const box = plot.current?.getBoundingClientRect();
    if (!box || count === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover(count > 1 ? Math.round(ratio * (count - 1)) : 0);
  }

  function toggle(id) {
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const previousSilent = chosen.every((item) => !item.previousDaily.some(Boolean));
  const tableRows = sortCampaigns(campaigns, sort.key, sort.dir);
  const sortBy = (key) => setSort((now) => (now.key === key ? { key, dir: now.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const head = (key, text, right = true) => (
    <th className={right ? "num" : ""} aria-sort={sort.key === key ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
      <button type="button" className={`ovx-sort${sort.key === key ? " is-on" : ""}`} onClick={() => sortBy(key)}>
        {text}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : " ↕"}</span>
      </button>
    </th>
  );

  const current = hover == null ? null : hover;
  const tipRight = current != null && count > 1 && current < count * 0.35;
  const avgDelta = allOn && previous ? deltaSeconds(totals.avgVisible, previous.avgVisible) : null;

  return (
    <>
      <section className="panel ovx-tiles" aria-label="Key numbers">
        <div className="ovx-tile is-main">
          <span className="ovx-tile-label">Impressions</span>
          <span className="ovx-tile-value">{formatCount(totals.impressions)}</span>
          <span className="ovx-tile-sub">
            {totals.delta ? (
              <>
                <b className={`ov-${totals.delta.tone}`}>{totals.delta.text}</b> <span className="ovx-muted">vs previous {days} days</span>
              </>
            ) : (
              <span className="ovx-muted">no previous period</span>
            )}
          </span>
        </div>
        <div className="ovx-tile">
          <span className="ovx-tile-label">Average view time</span>
          <span className="ovx-tile-value">{totals.avgVisible == null ? "—" : `${totals.avgVisible.toFixed(1)} s`}</span>
          <span className="ovx-tile-sub">
            {avgDelta ? (
              <>
                <b className={`ov-${avgDelta.tone}`}>{avgDelta.text}</b> <span className="ovx-muted">vs previous {days} days</span>
              </>
            ) : (
              <span className="ovx-muted">{totals.impressions > 0 ? "no previous period" : "weighted by impressions"}</span>
            )}
          </span>
        </div>
        <div className="ovx-tile">
          <span className="ovx-tile-label">Total visible time</span>
          <span className="ovx-tile-value">{totals.visibleHours == null ? "—" : `${totals.visibleHours.toFixed(1)} h`}</span>
          <span className="ovx-tile-sub ovx-muted">sum of seconds in view</span>
        </div>
        <div className="ovx-tile">
          <span className="ovx-tile-label">Games reached</span>
          <span className="ovx-tile-value">{formatCount(totals.games)}</span>
          <span className="ovx-tile-sub ovx-muted">{totals.gamesBooked > 0 ? `of ${formatCount(totals.gamesBooked)} in ${allOn ? "your" : "the selected"} campaigns` : allOn ? "across all campaigns" : `in ${chosen.length} of ${campaigns.length} campaigns`}</span>
        </div>
      </section>

      {campaigns.length > 0 && (
      <section className="panel ovx-chart" aria-labelledby="ovx-chart-title">
        <div className="ovx-chart-head">
          <h2 id="ovx-chart-title">
            Impressions per {grain} <span className="ovx-muted">· {BREAKDOWN_TEXT[breakdown]} · {formatDay(dates[0])} – {formatDay(dates[dates.length - 1])}</span>
          </h2>
          <span className="ovx-hint">Each line is one {breakdown === "total" ? "total" : breakdown}; choose which campaigns in “By campaign” below. Hover for exact numbers.</span>
        </div>
        <div className="ovx-controls">
          <div className="ovx-control">
            <span>Break down by</span>
            <div className="ovx-seg" role="group" aria-label="Break down by">
              {BREAKDOWNS.map(([key, text]) => {
                const off = (key === "creative" || key === "game" || key === "format") && !hasSplit;
                return (
                  <button key={key} type="button" aria-pressed={breakdown === key} disabled={off} title={off ? "Needs migration 0027_advertiser_daily_split.sql in the Supabase SQL editor" : undefined} onClick={() => pickBreakdown(key)}>
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ovx-control">
            <span>Per</span>
            <div className="ovx-seg" role="group" aria-label="Granularity">
              {[["day", "Day", false], ["week", "Week", days < 14]].map(([key, text, off]) => (
                <button key={key} type="button" aria-pressed={grain === key} disabled={off} onClick={() => setGrain(key)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          <label className="ovx-check">
            <input type="checkbox" checked={marks} onChange={(event) => setMarks(event.target.checked)} />
            Show pauses and blocks
            {marks && events.length === 0 && <small className="ovx-check-note">none in this period</small>}
          </label>
          <label className="ovx-check">
            <input
              type="checkbox"
              checked={compareOn}
              onChange={(event) => {
                // Comparing is a Total view: ticking it from another breakdown moves to Total.
                if (event.target.checked) { setBreakdown("total"); setCompare(true); } else setCompare(false);
              }}
            />
            Compare with previous period
            {breakdown !== "total" && <small className="ovx-check-note">switches to Total</small>}
            {compareOn && previousSilent && <small className="ovx-check-note">no impressions before</small>}
          </label>
        </div>

        {chosen.length === 0 ? (
          <p className="ovx-empty">No campaign is ticked. Tick one in the table below to see it here.</p>
        ) : (
          <div className="ovx-plotwrap" style={{ paddingBottom: 38 + rows * 22 }}>
            <div className="ovx-yaxis" aria-hidden="true">
              {[top, (top * 3) / 4, top / 2, top / 4, 0].map((tick) => (
                <span key={tick}>{formatCount(Math.round(tick))}</span>
              ))}
            </div>
            <div className="ovx-plot" ref={plot} onPointerMove={move} onPointerLeave={() => setHover(null)}>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Impressions per ${grain}, ${lines.map((line) => line.name).join(", ")}`}>
                {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                  <line key={step} x1="0" x2={W} y1={H - step * H + 0.5} y2={H - step * H + 0.5} className={step === 0 ? "ovx-base" : "ovx-grid"} vectorEffect="non-scaling-stroke" />
                ))}
                {lines.map((line) => (
                  <polyline
                    key={line.id}
                    points={line.points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeDasharray={line.dash}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {peak === 0 && <div className="ovx-plot-empty">No impressions in this period yet</div>}
              {placed.map((event, index) => (
                <span key={`${event.date}-${index}`}>
                  <span className="ovx-mark" style={{ left: `${event.at}%`, borderLeftColor: EVENT_COLOR[event.kind] }} aria-hidden="true" />
                  <span className="ovx-mark-name" style={{ left: `${event.at}%`, top: H + 30 + event.row * 22 }}>
                    {event.text}
                  </span>
                </span>
              ))}
              {current != null && (
                <>
                  <div className="ovx-cursor" style={{ left: `${count > 1 ? (current / (count - 1)) * 100 : 50}%` }} />
                  <div className={`ovx-tip ${tipRight ? "is-right" : ""}`} style={{ left: `${count > 1 ? (current / (count - 1)) * 100 : 50}%` }} role="status">
                    <b>{label(axis[current])}</b>
                    {lines.map((line) => (
                      <div key={line.id} className="ovx-tip-row">
                        <span style={{ color: tint(line.color === "#1c1b1a" ? "#9a948b" : line.color) }}>● {line.name}</span>
                        <b>{formatCount(line.points[current]?.value ?? 0)}</b>
                      </div>
                    ))}
                    {lines.length > 1 && breakdown !== "total" && (
                      <div className="ovx-tip-row ovx-tip-total">
                        <span>Total</span>
                        <b>{formatCount(lines.reduce((sum, line) => sum + (line.points[current]?.value ?? 0), 0))}</b>
                      </div>
                    )}
                  </div>
                </>
              )}
              {lines.map((line, index) => (
                <span key={line.id} className="ovx-endname" style={{ top: ends[index], color: line.color === "#9a948b" ? "#6b665f" : line.color }}>
                  {line.name}
                </span>
              ))}
              <div className="ovx-xaxis" aria-hidden="true">
                {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                  <span key={step}>{formatDay(axis[Math.round(step * (count - 1))].date)}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      )}

      <section className="panel ovx-table" aria-labelledby="ovx-table-title" style={{ padding: 0 }}>
        <div className="ovx-table-head">
          <h2 id="ovx-table-title">By campaign</h2>
          <span className="ovx-hint">Tick a campaign to show it on the chart above. Click a column title to sort.</span>
        </div>
        {campaigns.length === 0 ? (
          <div className="ovx-none">
            <span className="ovx-none-ic" aria-hidden="true">∅</span>
            <div><strong>No campaigns yet</strong><span>Nothing to list here until you start one.</span></div>
            <Link href="/dashboard/advertising/new" className="button button-small">Create your first campaign</Link>
          </div>
        ) : (
          <div className="ov-table-wrap">
            <table className="ovx-grid-table">
              <thead>
                <tr>
                  {head("name", "Campaign", false)}
                  {head("impressions", "Impressions")}
                  {head("share", "Share", false)}
                  {head("change", `vs previous ${days} days`)}
                  {head("avgVisible", "Avg view")}
                  {head("games", "Games")}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((item) => {
                  const on = selected.has(item.id);
                  const color = colorFor.get(item.id);
                  const silent = item.impressions === 0 && !item.daily.some(Boolean);
                  const share = totals.impressions > 0 && on ? Math.round((item.impressions / totals.impressions) * 100) : 0;
                  const change = deltaText(item.impressions, item.previousDaily.reduce((sum, value) => sum + value, 0));
                  return (
                    <tr key={item.id} className={on ? "" : "ovx-off"}>
                      <td className="ov-name">
                        <span className="ovx-namecell">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`Show ${item.name} on the chart`}
                            className="ovx-box"
                            style={on ? { background: color, borderColor: color } : { borderColor: color }}
                            onClick={() => toggle(item.id)}
                          >
                            {on ? "✓" : ""}
                          </button>
                          <CategoryIcon category={item.category} label={item.category ? categoryLabel(item.category) : "No category yet"} />
                          <Link href={`/dashboard/advertising/c/${item.id}`}>{item.name}</Link>
                          <StatusPill status={item.status} />
                        </span>
                      </td>
                      <td className="num">
                        <strong>{silent ? "—" : formatCount(item.impressions)}</strong>
                      </td>
                      <td>
                        <span className="ovx-share">
                          <span className="ovx-share-track">
                            <span style={{ width: `${share}%`, background: silent || !on ? "#9a948b" : color }} />
                          </span>
                          <span className="num">{silent ? "0%" : on ? `${share}%` : ""}</span>
                        </span>
                      </td>
                      <td className={`num ${change ? `ov-${change.tone}` : "ovx-muted"}`}>{change ? change.text : item.impressions > 0 ? "new" : "—"}</td>
                      <td className="num">{item.avgVisible == null ? "—" : `${item.avgVisible.toFixed(1)} s`}</td>
                      <td className="num">{item.games || "—"}</td>
                    </tr>
                  );
                })}
                <tr className="ovx-total">
                  <td>{allOn ? "Total" : `Selected: ${chosen.length} of ${campaigns.length}`}</td>
                  <td className="num">{formatCount(totals.impressions)}</td>
                  <td />
                  <td className={`num ${totals.delta ? `ov-${totals.delta.tone}` : "ovx-muted"}`}>{totals.delta ? totals.delta.text : "—"}</td>
                  <td className="num">{totals.avgVisible == null ? "—" : `${totals.avgVisible.toFixed(1)} s`}</td>
                  <td className="num">{totals.games || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
