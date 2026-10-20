"use client";

import Link from "next/link";
import CategoryIcon from "./advertising/category-icon";
import ChartHead from "./chart-head";
import KeyNumbers from "./key-numbers";
import StatusPill from "./advertising/status-pill";
import { categoryLabel } from "../../lib/categories";
import { useMemo, useRef, useState } from "react";
import { formatCount, formatDay, niceMax } from "../../lib/analytics";
import { deltaText } from "../../lib/advertiser-overview";
import { ratio } from "../../lib/performance-view";
import { byDay, byWeek, chartEvents, colorOf, dashOf, mergeSplit, selectionTotals, sortCampaigns, sumSeries, weekdayDay } from "../../lib/overview-chart";

const W = 720;
const H = 170;
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
 * down by campaign or creative (creative needs migration 0027), per day or per week,
 * with the pauses and blocks marked on it; Total can be compared with the period before.
 */
export default function OverviewExplorer({ days, dates, campaigns, previous = null, splitMissing = false, reach = null }) {
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

  const colorFor = useMemo(() => new Map(campaigns.map((item, index) => [item.id, colorOf(index)])), [campaigns]);
  const chosen = campaigns.filter((item) => selected.has(item.id));
  const totals = selectionTotals(chosen);
  const allOn = chosen.length === campaigns.length;
  // Players and sessions cannot be added up across campaigns (one person may see several), so the server counts them
  // for all campaigns at once. That equals the selection while it holds every campaign that had views.
  const reachOn = Boolean(reach) && campaigns.filter((item) => item.impressions > 0).every((item) => selected.has(item.id));
  const hasPrevious = chosen.some((item) => item.previousDaily.some(Boolean));
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
  // the best day of the ticked campaigns together
  const daily = sumSeries(chosen.map((item) => item.daily), days);
  let best = null;
  daily.forEach((value, index) => { if (dates[index] && value > 0 && (!best || value > best.value)) best = { value, date: dates[index] }; });

  return (
    <>
      <KeyNumbers
        hero={{
          value: formatCount(totals.impressions),
          delta: totals.delta,
          tail: totals.delta ? `vs previous ${days} days` : "no previous period",
          perDay: formatCount(Math.round(totals.impressions / Math.max(days, 1))),
          bestLabel: `Best day${best ? ` · ${formatDay(best.date)}` : ""}`,
          best: best ? formatCount(best.value) : "—",
        }}
        items={[
          { icon: "users", label: "Players reached", value: reachOn && reach.players > 0 ? formatCount(reach.players) : "—", sub: !reachOn ? "select every campaign with views" : reach.players > 0 ? "different people who saw an ad" : "counted once games update the SDK" },
          { icon: "clock", label: "Average view time", value: totals.avgVisible == null ? "—" : `${totals.avgVisible.toFixed(1)} s`, sub: avgDelta ? <><b className={`ov-${avgDelta.tone}`}>{avgDelta.text}</b> vs previous {days} d</> : totals.impressions > 0 ? "no previous period" : "weighted by impressions" },
          { icon: "eye", label: "Total visible time", value: totals.visibleHours == null ? "—" : `${totals.visibleHours.toFixed(1)} h`, sub: "sum of seconds in view" },
          { icon: "games", label: "Games reached", value: formatCount(totals.games), sub: totals.gamesBooked > 0 ? `of ${formatCount(totals.gamesBooked)} in ${allOn ? "your" : "the selected"} campaigns` : allOn ? "across all campaigns" : `in ${chosen.length} of ${campaigns.length} campaigns` },
          { icon: "pulse", label: "Impressions per session", value: reachOn ? ratio(reach.perSession) : "—", sub: reachOn ? `${formatCount(reach.sessions)} sessions` : "select every campaign with views" },
          { icon: "user", label: "Impressions per player", value: reachOn ? ratio(reach.perPlayer) : "—", sub: reachOn ? "how often one player saw an ad" : "select every campaign with views" },
        ]}
      />

      {campaigns.length > 0 && (
      <section className="panel ovx-chart" data-fw="1" aria-labelledby="ovx-chart-title">
        <ChartHead days={days} dates={dates} grain={grain} setGrain={setGrain} breakdown={breakdown} setBreakdown={setBreakdown} marks={marks} setMarks={setMarks} compare={compare} setCompare={setCompare} hasPrevious={hasPrevious} hasSplit={hasSplit} />

        {chosen.length > 0 && (
          <ul className="ovx-legend" aria-label="Lines on the chart">
            {lines.slice(0, 8).map((line) => (
              <li key={line.id} title={line.name}>
                <span className={`ovx-legend-line${line.dash ? " is-dashed" : ""}`} style={{ color: line.color }} aria-hidden="true" />
                <span>{line.name}</span>
              </li>
            ))}
            {lines.length > 8 && <li className="ovx-legend-more">+{lines.length - 8} more · hover the chart for names</li>}
          </ul>
        )}

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

      <section className="panel ovx-table" data-fw="1" aria-labelledby="ovx-table-title" style={{ padding: 0 }}>
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
                  <th aria-sort={sort.key === "name" ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
                    <span className="ovx-selectall">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={allOn}
                        aria-label={allOn ? "Clear all campaigns from the chart" : "Show all campaigns on the chart"}
                        className="ovx-box"
                        style={allOn ? { background: "#1c1b1a", borderColor: "#1c1b1a" } : undefined}
                        onClick={() => setSelected(allOn ? new Set() : new Set(campaigns.map((item) => item.id)))}
                      >
                        {allOn ? "✓" : ""}
                      </button>
                      <button type="button" className={`ovx-sort${sort.key === "name" ? " is-on" : ""}`} onClick={() => sortBy("name")}>
                        Campaign
                        <span aria-hidden="true">{sort.key === "name" ? (sort.dir === "desc" ? " ▼" : " ▲") : " ↕"}</span>
                      </button>
                    </span>
                  </th>
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
