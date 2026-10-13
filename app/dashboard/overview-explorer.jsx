"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatCount, formatDay, niceMax } from "../../lib/analytics";
import { deltaText } from "../../lib/advertiser-overview";
import { byDay, byWeek, colorOf, selectionTotals, sortCampaigns, sumSeries } from "../../lib/overview-chart";

const W = 720;
const H = 240;

/**
 * The Overview's working part: headline numbers, an impressions chart and the "By campaign" table, all
 * driven by the campaigns ticked in the table. Break down by Total or Campaign, per day or per week,
 * compare with the period before (Total). Everything is computed from the series the page already loaded.
 */
export default function OverviewExplorer({ days, dates, campaigns }) {
  const [selected, setSelected] = useState(() => new Set(campaigns.filter((item) => item.impressions > 0 || item.daily.some(Boolean)).map((item) => item.id)));
  const [breakdown, setBreakdown] = useState("campaign");
  const [grain, setGrain] = useState("day");
  const [compare, setCompare] = useState(false);
  const [sort, setSort] = useState({ key: "impressions", dir: "desc" });
  const [hover, setHover] = useState(null);
  const plot = useRef(null);

  const colorFor = useMemo(() => new Map(campaigns.map((item, index) => [item.id, colorOf(index)])), [campaigns]);
  const chosen = campaigns.filter((item) => selected.has(item.id));
  const totals = selectionTotals(chosen);
  const allOn = chosen.length === campaigns.length;

  const bucket = grain === "week" ? (values) => byWeek(values, dates) : (values) => byDay(values, dates);
  const lines = useMemo(() => {
    if (breakdown === "campaign") {
      return chosen.map((item) => ({ id: item.id, name: item.name, color: colorFor.get(item.id), dashed: false, points: bucket(item.daily) }));
    }
    const list = [{ id: "total", name: "All selected", color: "#1c1b1a", dashed: false, points: bucket(sumSeries(chosen.map((item) => item.daily), days)) }];
    if (compare) {
      const previous = bucket(sumSeries(chosen.map((item) => item.previousDaily), days)).map((point, index) => ({ ...point, date: list[0].points[index]?.date ?? point.date }));
      list.push({ id: "previous", name: `Previous ${days} days`, color: "#9a948b", dashed: true, points: previous });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown, grain, compare, selected, campaigns]);

  const count = lines[0]?.points.length ?? 0;
  const peak = Math.max(0, ...lines.flatMap((line) => line.points.map((point) => point.value)));
  const top = niceMax(peak);
  const x = (index) => (count > 1 ? (index / (count - 1)) * W : W / 2);
  const y = (value) => H - (value / top) * H;
  const label = (point) => (grain === "week" ? `${formatDay(point.date)} – ${formatDay(point.to)}` : formatDay(point.date));

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

  const rows = sortCampaigns(campaigns, sort.key, sort.dir);
  const sortBy = (key) => setSort((now) => (now.key === key ? { key, dir: now.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const head = (key, text, right = true) => (
    <th className={right ? "num" : ""} aria-sort={sort.key === key ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
      <button type="button" className="ovx-sort" onClick={() => sortBy(key)}>
        {text}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : " ↕"}</span>
      </button>
    </th>
  );

  const seg = (items, value, set, label) => (
    <div className="ovx-seg" role="group" aria-label={label}>
      {items.map(([key, text, disabled]) => (
        <button key={key} type="button" aria-pressed={value === key} disabled={disabled} onClick={() => set(key)}>
          {text}
        </button>
      ))}
    </div>
  );

  const current = hover == null ? null : hover;
  const tipRight = current != null && count > 1 && current < count * 0.35;

  return (
    <>
      <section className="panel ovx-tiles" aria-label="Key numbers">
        <div className="ovx-tile is-main">
          <span className="ovx-tile-label">Impressions</span>
          <span className="ovx-tile-value">{formatCount(totals.impressions)}</span>
          <span className="ovx-tile-sub">
            {totals.delta ? (
              <>
                <b className={`ov-${totals.delta.tone}`}>{totals.delta.text}</b> vs previous {days} days
              </>
            ) : (
              <span className="ovx-muted">no previous period to compare</span>
            )}
          </span>
        </div>
        <div className="ovx-tile">
          <span className="ovx-tile-label">Average view time</span>
          <span className="ovx-tile-value">{totals.avgVisible == null ? "—" : `${totals.avgVisible.toFixed(1)} s`}</span>
          <span className="ovx-tile-sub ovx-muted">weighted by impressions</span>
        </div>
        <div className="ovx-tile">
          <span className="ovx-tile-label">Total visible time</span>
          <span className="ovx-tile-value">{totals.visibleHours == null ? "—" : `${totals.visibleHours.toFixed(1)} h`}</span>
          <span className="ovx-tile-sub ovx-muted">sum of seconds in view</span>
        </div>
        <div className="ovx-tile">
          <span className="ovx-tile-label">Games reached</span>
          <span className="ovx-tile-value">{formatCount(totals.games)}</span>
          <span className="ovx-tile-sub ovx-muted">{allOn ? "across all campaigns" : `in ${chosen.length} of ${campaigns.length} campaigns`}</span>
        </div>
      </section>

      <section className="panel ovx-chart" aria-labelledby="ovx-chart-title">
        <div className="ovx-chart-head">
          <h2 id="ovx-chart-title">
            Impressions per {grain} <span className="ovx-muted">· {breakdown === "campaign" ? "by campaign" : "all selected campaigns"} · {formatDay(dates[0])} – {formatDay(dates[dates.length - 1])}</span>
          </h2>
          <span className="ovx-hint">Choose campaigns in “By campaign” below. Hover the chart for exact numbers.</span>
        </div>
        <div className="ovx-controls">
          <div className="ovx-control">
            <span>Break down by</span>
            {seg([["total", "Total"], ["campaign", "Campaign"]], breakdown, setBreakdown, "Break down by")}
          </div>
          <div className="ovx-control">
            <span>Per</span>
            {seg([["day", "Day"], ["week", "Week", days < 14]], grain, setGrain, "Granularity")}
          </div>
          <label className={`ovx-check ${breakdown !== "total" ? "is-off" : ""}`} title={breakdown !== "total" ? "Available for Total" : undefined}>
            <input type="checkbox" checked={compare && breakdown === "total"} disabled={breakdown !== "total"} onChange={(event) => setCompare(event.target.checked)} />
            Compare with previous period
          </label>
        </div>

        {chosen.length === 0 ? (
          <p className="ovx-empty">No campaign is ticked. Tick one in the table below to see it here.</p>
        ) : (
          <div className="ovx-plotwrap">
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
                    strokeDasharray={line.dashed ? "7 4" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {current != null && (
                <>
                  <div className="ovx-cursor" style={{ left: `${count > 1 ? (current / (count - 1)) * 100 : 50}%` }} />
                  <div className={`ovx-tip ${tipRight ? "is-right" : ""}`} style={{ left: `${count > 1 ? (current / (count - 1)) * 100 : 50}%` }} role="status">
                    <b>{label(lines[0].points[current])}</b>
                    {lines.map((line) => (
                      <div key={line.id} className="ovx-tip-row">
                        <span>
                          <i className="ovx-dot" style={{ background: line.color === "#1c1b1a" ? "#fff" : line.color }} aria-hidden="true" />
                          {line.name}
                        </span>
                        <b>{formatCount(line.points[current]?.value ?? 0)}</b>
                      </div>
                    ))}
                    {lines.length > 1 && breakdown === "campaign" && (
                      <div className="ovx-tip-row ovx-tip-total">
                        <span>Total</span>
                        <b>{formatCount(lines.reduce((sum, line) => sum + (line.points[current]?.value ?? 0), 0))}</b>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="ovx-xaxis" aria-hidden="true">
                <span>{label(lines[0].points[0])}</span>
                <span>{label(lines[0].points[Math.floor((count - 1) / 2)])}</span>
                <span>{label(lines[0].points[count - 1])}</span>
              </div>
            </div>
          </div>
        )}
        {lines.length > 1 && (
          <ul className="ovx-legend" aria-label="Legend">
            {lines.map((line) => (
              <li key={line.id}>
                <span className="ovx-swatch" style={{ background: line.color, ...(line.dashed ? { background: "repeating-linear-gradient(90deg,#9a948b 0 6px,transparent 6px 9px)" } : {}) }} aria-hidden="true" />
                {line.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel ovx-table" aria-labelledby="ovx-table-title" style={{ padding: 0 }}>
        <div className="ovx-table-head">
          <h2 id="ovx-table-title">By campaign</h2>
          <span className="ovx-hint">Tick a campaign to show it on the chart above. Click a column title to sort.</span>
        </div>
        {campaigns.length === 0 ? (
          <p className="settings-help" style={{ padding: "0 1.25rem 1.25rem" }}>
            No campaigns yet.
          </p>
        ) : (
          <div className="ov-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{/* checkbox column */}</th>
                  {head("name", "Campaign", false)}
                  {head("impressions", "Impressions")}
                  <th>Share</th>
                  {head("change", `vs previous ${days} days`)}
                  {head("avgVisible", "Avg view")}
                  {head("games", "Games")}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const on = selected.has(item.id);
                  const color = colorFor.get(item.id);
                  const silent = item.impressions === 0 && !item.daily.some(Boolean);
                  const share = totals.impressions > 0 && on ? Math.round((item.impressions / totals.impressions) * 100) : 0;
                  const change = deltaText(item.impressions, item.previousDaily.reduce((sum, value) => sum + value, 0));
                  return (
                    <tr key={item.id} className={on ? "" : "ovx-off"}>
                      <td className="ovx-tick">
                        {silent ? (
                          <span className="ovx-box is-disabled" role="checkbox" aria-checked="false" aria-disabled="true" aria-label={`${item.name}: no impressions yet`} />
                        ) : (
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
                        )}
                      </td>
                      <td className="ov-name">
                        <Link href={`/dashboard/advertising/c/${item.id}`}>{item.name}</Link>
                        <span className={`ov-pill ov-${item.status.key}`}>{item.status.label}</span>
                      </td>
                      <td className="num">
                        <strong>{silent ? "—" : formatCount(item.impressions)}</strong>
                      </td>
                      <td>
                        {on && !silent ? (
                          <span className="ovx-share">
                            <span className="ovx-share-track">
                              <span style={{ width: `${share}%`, background: color }} />
                            </span>
                            <span className="num">{share}%</span>
                          </span>
                        ) : null}
                      </td>
                      <td className={`num ${change ? `ov-${change.tone}` : "ovx-muted"}`}>{change ? change.text : item.impressions > 0 ? "new" : "—"}</td>
                      <td className="num">{item.avgVisible == null ? "—" : `${item.avgVisible.toFixed(1)} s`}</td>
                      <td className="num">{item.games || "—"}</td>
                    </tr>
                  );
                })}
                <tr className="ovx-total">
                  <td />
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
