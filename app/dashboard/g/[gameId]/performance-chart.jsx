"use client";

import { useState } from "react";
import { formatCount, formatDay } from "../../../../lib/analytics";
import { compactCount, figures, niceTop } from "../../../../lib/performance-view";

/**
 * Impressions per day as stacked columns: advertisers' views and the developer's own pictures, one on the other.
 * With one source chosen only that series is drawn. Two series, so there is a legend, and the colours are never the
 * only carrier of meaning: the tooltip, the labels and "Show as table" name each series. Each column is the hover and
 * focus target (the full height of the plot, wider than the painted bar).
 *
 * days: [{ date, adv, own, sessions, advSessions, ownSessions, … }] oldest first.
 */
export default function PerformanceChart({ days, source, title = "Impressions per day", subtitle }) {
  const [active, setActive] = useState(null);
  const showAdv = source !== "own";
  const showOwn = source !== "adv";

  const adv = (day) => (showAdv ? day.adv : 0);
  const own = (day) => (showOwn ? day.own : 0);
  const peak = Math.max(0, ...days.map((day) => adv(day) + own(day)));
  const top = niceTop(peak);
  const ticks = [top, (top * 2) / 3, top / 3, 0];
  const current = active !== null && active < days.length ? days[active] : null;
  const align = active === null ? "" : active < 3 ? "is-start" : active > days.length - 4 ? "is-end" : "";
  const share = (value) => `${(Math.min(value / top, 1) * 100).toFixed(2)}%`;
  const total = days.reduce((sum, day) => sum + adv(day) + own(day), 0);

  return (
    <section className="pf-panel" aria-labelledby="pf-chart-title">
      <div className="pf-panel-head">
        <h2 id="pf-chart-title">{title}</h2>
        <span className="pf-sub">
          {subtitle} · {formatCount(total)} in total
        </span>
      </div>

      <div className="pf-legend" aria-label="Series">
        {showAdv && (
          <span>
            <span className="pf-key pf-key-adv" aria-hidden="true" />
            Advertisers
          </span>
        )}
        {showOwn && (
          <span>
            <span className="pf-key pf-key-own" aria-hidden="true" />
            My pictures
          </span>
        )}
      </div>

      <figure className="pf-chart">
        <div className="pf-plot" onPointerLeave={() => setActive(null)}>
          <div className="pf-grid-lines" aria-hidden="true">
            {ticks.map((tick) => (
              <div key={tick} className="pf-gridline" style={{ bottom: `${(tick / top) * 100}%` }}>
                <span className="pf-tick">{compactCount(tick)}</span>
              </div>
            ))}
          </div>

          <div className="pf-cols" role="group" aria-label={title}>
            {days.map((day, index) => {
              const a = adv(day);
              const o = own(day);
              const label =
                `${formatDay(day.date)}: ${formatCount(a + o)} impressions` +
                (showAdv && showOwn ? ` (${formatCount(a)} advertisers, ${formatCount(o)} my pictures)` : "");
              return (
                <div
                  key={day.date}
                  className={`pf-col ${active === index ? "is-active" : ""}`}
                  role="img"
                  tabIndex={0}
                  aria-label={label}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <span className="pf-bars">
                    {o > 0 && <span className="pf-piece pf-piece-own" style={{ height: share(o), borderRadius: "4px 4px 0 0" }} />}
                    {a > 0 && <span className="pf-piece pf-piece-adv" style={{ height: share(a), borderRadius: o > 0 ? 0 : "4px 4px 0 0" }} />}
                  </span>
                </div>
              );
            })}
          </div>

          {current && (
            <div
              className={`pf-tip ${align}`}
              style={{ left: `calc(3rem + (100% - 3rem) * ${((active + 0.5) / days.length).toFixed(4)})` }}
              role="status"
            >
              <div className="pf-tip-date">{formatDay(current.date)}</div>
              {showAdv && (
                <div className="pf-tip-row">
                  <span className="pf-tip-key pf-key-adv" aria-hidden="true" />
                  <span className="pf-tip-val">{formatCount(current.adv)}</span>
                  <span className="pf-tip-label">Advertisers</span>
                </div>
              )}
              {showOwn && (
                <div className="pf-tip-row">
                  <span className="pf-tip-key pf-key-own" aria-hidden="true" />
                  <span className="pf-tip-val">{formatCount(current.own)}</span>
                  <span className="pf-tip-label">My pictures</span>
                </div>
              )}
              <div className="pf-tip-meta">
                {formatCount(adv(current) + own(current))} total · {formatCount(figures(current, source).sessions)} sessions
              </div>
            </div>
          )}
        </div>

        <div className="pf-axis" aria-hidden="true">
          <span>{formatDay(days[0].date)}</span>
          <span>{formatDay(days[Math.floor((days.length - 1) / 2)].date)}</span>
          <span>{formatDay(days[days.length - 1].date)}</span>
        </div>

        <details className="pf-details">
          <summary>Show as table</summary>
          <div className="pf-mini" role="table" aria-label={title}>
            <div className="pf-mini-row pf-mini-head" role="row">
              <span role="columnheader">Day (UTC)</span>
              <span className="pf-num" role="columnheader">Advertisers</span>
              <span className="pf-num" role="columnheader">My pictures</span>
              <span className="pf-num" role="columnheader">Total</span>
            </div>
            {[...days].reverse().map((day) => (
              <div key={day.date} className="pf-mini-row" role="row">
                <span role="cell">{formatDay(day.date)}</span>
                <span className="pf-num" role="cell">{formatCount(day.adv)}</span>
                <span className="pf-num" role="cell">{formatCount(day.own)}</span>
                <span className="pf-num" role="cell">{formatCount(adv(day) + own(day))}</span>
              </div>
            ))}
          </div>
        </details>
      </figure>
    </section>
  );
}
