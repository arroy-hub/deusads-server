"use client";

import { useState } from "react";
import { formatCount, formatDay, niceMax } from "../../../../lib/analytics";

/**
 * Impressions per day as columns. One series, so no legend: the heading names it.
 * Each column is the hover/focus target (the full height of the plot, wider than
 * the painted bar), and every value is also in the table under "Show as table".
 */
export default function DailyChart({ days }) {
  const [active, setActive] = useState(null);

  const peak = Math.max(0, ...days.map((day) => day.impressions));
  const top = niceMax(peak);
  const ticks = [top, top / 2, 0];
  const current = active === null ? null : days[active];

  // Keep the readout inside the plot near either edge.
  const align = active === null ? "centre" : active < 3 ? "start" : active > days.length - 4 ? "end" : "centre";

  return (
    <figure className="chart">
      <div className="chart-plot" onPointerLeave={() => setActive(null)}>
        <div className="chart-grid" aria-hidden="true">
          {ticks.map((tick) => (
            <div key={tick} className="chart-gridline" style={{ bottom: `${(tick / top) * 100}%` }}>
              <span className="chart-tick">{formatCount(tick)}</span>
            </div>
          ))}
        </div>

        <div className="chart-cols" role="group" aria-label="Impressions per day">
          {days.map((day, index) => (
            <div
              key={day.date}
              className={`chart-col ${active === index ? "is-active" : ""}`}
              role="img"
              tabIndex={0}
              aria-label={`${formatDay(day.date)}: ${formatCount(day.impressions)} impressions, ${formatCount(day.sessions)} sessions`}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <span className="chart-bar" style={{ height: `${(day.impressions / top) * 100}%` }} />
            </div>
          ))}
        </div>

        {current && (
          <div
            className={`chart-tip chart-tip-${align}`}
            style={{ left: `calc(3rem + (100% - 3rem) * ${(active + 0.5) / days.length})` }}
            role="status"
          >
            <div className="chart-tip-value">
              <span className="chart-tip-key" aria-hidden="true" />
              {formatCount(current.impressions)}
              <span className="chart-tip-unit"> impressions</span>
            </div>
            <div className="chart-tip-meta">
              {formatDay(current.date)} · {formatCount(current.sessions)} sessions
            </div>
          </div>
        )}
      </div>

      <div className="chart-axis" aria-hidden="true">
        <span>{formatDay(days[0].date)}</span>
        <span>{formatDay(days[Math.floor((days.length - 1) / 2)].date)}</span>
        <span>{formatDay(days[days.length - 1].date)}</span>
      </div>

      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>Day (UTC)</th>
              <th className="num">Impressions</th>
              <th className="num">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.date}>
                <td>{formatDay(day.date)}</td>
                <td className="num">{formatCount(day.impressions)}</td>
                <td className="num">{formatCount(day.sessions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
