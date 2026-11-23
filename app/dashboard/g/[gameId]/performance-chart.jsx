"use client";

import { useState } from "react";
import { formatCount, formatDay } from "../../../../lib/analytics";
import { compactCount, figures, niceTop } from "../../../../lib/performance-view";
import { credits, earnedOf, moneyTop, tickText } from "../../../../lib/wallet";
import { EarnedTipRow, MetricSwitch, earnedText } from "../../earnings-parts";

/**
 * Impressions per day as stacked columns: advertisers' views and the developer's own creatives, one on the other.
 * With one source chosen only that series is drawn. Two series, so there is a legend, and the colours are never the
 * only carrier of meaning: the tooltip, the labels and "Show as table" name each series. Each column is the hover and
 * focus target (the full height of the plot, wider than the painted bar).
 *
 * days: [{ date, adv, own, paid, sessions, advSessions, ownSessions, … }] oldest first.
 *
 * With the wallet (`earnings`: { metric, onMetric, today }) the chart can also draw what each day earned: only
 * advertisers' impressions are paid, so that view has one series. `today` is the day still being counted: its column is hatched.
 */
export default function PerformanceChart({ days, source, title: givenTitle = "Impressions per day", subtitle, advanced = null, earnings = null }) {
  const [active, setActive] = useState(null);
  const earn = Boolean(earnings) && earnings.metric === "earn";
  const title = earn ? "Earnings per day" : givenTitle;
  const showAdv = source !== "own";
  const showOwn = source !== "adv" && !earn;

  const adv = (day) => (showAdv ? (earn ? earnedOf(day.paid) : day.adv) : 0);
  const own = (day) => (showOwn ? day.own : 0);
  const peak = Math.max(0, ...days.map((day) => adv(day) + own(day)));
  const top = earn ? moneyTop(peak) : niceTop(peak);
  const ticks = earn ? [top, top / 2, 0] : [top, (top * 2) / 3, top / 3, 0];
  const isToday = (day) => Boolean(earnings) && day.date === earnings.today;
  const current = active !== null && active < days.length ? days[active] : null;
  const align = active === null ? "" : active < 3 ? "is-start" : active > days.length - 4 ? "is-end" : "";
  const share = (value) => `${(Math.min(value / top, 1) * 100).toFixed(2)}%`;
  const total = days.reduce((sum, day) => sum + adv(day) + own(day), 0);

  return (
    <section className="pf-panel" data-fw="1" aria-labelledby="pf-chart-title">
      {earnings ? (
        <div className="pf-panel-head pm-phead">
          <div>
            <h2 id="pf-chart-title">{title}</h2>
            <span className="pf-sub">
              {subtitle} · {earn ? `${credits(total)} C.` : formatCount(total)} in total
            </span>
          </div>
          <MetricSwitch value={earnings.metric} onChange={earnings.onMetric} />
        </div>
      ) : (
        <div className="pf-panel-head">
          <h2 id="pf-chart-title">{title}</h2>
          <span className="pf-sub">
            {subtitle} · {formatCount(total)} in total
          </span>
        </div>
      )}

      {earn && source === "own" ? (
        <p className="pf-hint pm-note" role="status">My creatives are not paid, so there are no earnings to show for them. Choose All or Advertisers above.</p>
      ) : (
        total === 0 && <p className="pf-hint" role="status">{earn ? "No earnings in this period yet. Bars appear here as soon as players see advertisers’ creatives." : "No impressions in this period yet. Bars appear here as soon as players see ads."}</p>
      )}

      <div className="pf-legend" aria-label="Series">
        {showAdv && (
          <span>
            <span className="pf-key pf-key-adv" aria-hidden="true" />
            Advertisers{earn ? ` · ${credits(total)} C.` : ""}
          </span>
        )}
        {showOwn && (
          <span>
            <span className="pf-key pf-key-own" aria-hidden="true" />
            My creatives
          </span>
        )}
        {earn && source !== "own" && <span className="pm-unpaid">My creatives are not paid</span>}
        {earnings && <span className="pm-todaykey"><i />Today so far</span>}
      </div>

      <figure className="pf-chart">
        <div className={`pf-plot${earnings ? " pm-plot" : ""}`} onPointerLeave={() => setActive(null)}>
          <div className="pf-grid-lines" aria-hidden="true">
            {ticks.map((tick) => (
              <div key={tick} className="pf-gridline" style={{ bottom: `${(tick / top) * 100}%` }}>
                <span className="pf-tick">{earn ? tickText(tick) : compactCount(tick)}</span>
              </div>
            ))}
          </div>

          <div className="pf-cols" role="group" aria-label={title} style={{ gap: days.length <= 14 ? 14 : days.length <= 45 ? 4 : 2 }}>
            {days.map((day, index) => {
              const a = adv(day);
              const o = own(day);
              const label = earn
                ? `${formatDay(day.date)}${isToday(day) ? ", today so far" : ""}: ${credits(a)} C. earned`
                : `${formatDay(day.date)}${isToday(day) ? ", today so far" : ""}: ${formatCount(a + o)} impressions` +
                  (showAdv && showOwn ? ` (${formatCount(a)} advertisers, ${formatCount(o)} my creatives)` : "");
              return (
                <div
                  key={day.date}
                  className={`pf-col ${active === index ? "is-active" : ""}${isToday(day) ? " pm-today" : ""}`}
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
              className={earnings ? `pf-tip pm-tip ${(active + 0.5) / days.length > 0.6 ? "is-left" : "is-right"}` : `pf-tip ${align}`}
              style={{ left: `calc(3rem + (100% - 3rem) * ${((active + 0.5) / days.length).toFixed(4)})` }}
              role="status"
            >
              <div className="pf-tip-date">{formatDay(current.date)}{isToday(current) ? " · today so far" : ""}</div>
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
                  <span className="pf-tip-label">My creatives</span>
                </div>
              )}
              {earnings && showAdv && <EarnedTipRow paid={current.paid} />}
              <div className="pf-tip-meta">
                {earn ? "" : `${formatCount(adv(current) + own(current))} total · `}{formatCount(figures(current, source).sessions)} sessions
              </div>
            </div>
          )}
        </div>

        <div className="pf-axis" aria-hidden="true">
          <span>{formatDay(days[0].date)}</span>
          <span>{formatDay(days[Math.floor((days.length - 1) / 2)].date)}</span>
          <span>{formatDay(days[days.length - 1].date)}</span>
        </div>

        {advanced ? advanced : (<details className="pf-details">
          <summary>Show as table</summary>
          <div className={`pf-mini${earnings ? " pm-mini" : ""}`} role="table" aria-label={title}>
            <div className="pf-mini-row pf-mini-head" role="row">
              <span role="columnheader">Day (UTC)</span>
              <span className="pf-num" role="columnheader">Advertisers</span>
              <span className="pf-num" role="columnheader">My creatives</span>
              <span className="pf-num" role="columnheader">Total</span>
              {earnings && <span className="pf-num" role="columnheader">Earned</span>}
            </div>
            {[...days].reverse().map((day) => (
              <div key={day.date} className="pf-mini-row" role="row">
                <span role="cell">{formatDay(day.date)}</span>
                <span className="pf-num" role="cell">{formatCount(day.adv)}</span>
                <span className="pf-num" role="cell">{formatCount(day.own)}</span>
                <span className="pf-num" role="cell">{formatCount((source !== "own" ? day.adv : 0) + (source !== "adv" ? day.own : 0))}</span>
                {earnings && <span className="pf-num" role="cell">{earnedText(day.paid)}</span>}
              </div>
            ))}
          </div>
        </details>)}
      </figure>
    </section>
  );
}
