"use client";

import { formatCount } from "../../lib/analytics";

const percent = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);

function Tile({ label, figure, wait }) {
  return (
    <div className="at-tile">
      <span className="at-label">{label}</span>
      <span className="at-value">{percent(figure.rate)}</span>
      <span className="at-sub">
        {figure.rate == null ? wait : `${formatCount(figure.returned)} of ${formatCount(figure.players)} new players came back`}
      </span>
    </div>
  );
}

/** Players per day as bars; a quiet day is a low bar, not a gap. */
function DailyBars({ days }) {
  const max = Math.max(1, ...days.map((day) => day.players));
  const width = 600;
  const height = 110;
  const step = width / days.length;
  return (
    <svg className="rt-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Players per day" preserveAspectRatio="none">
      {days.map((day, index) => {
        const h = Math.max(day.players > 0 ? 2 : 0, (day.players / max) * (height - 6));
        return (
          <rect key={day.date} x={index * step + step * 0.12} y={height - h} width={Math.max(1, step * 0.76)} height={h} className="rt-bar">
            <title>{`${day.date}: ${day.players} players`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * Do players come back, and how many play each day (migration 0039, SDK 0.10+). `retention` is
 * { retention, daily, missing } from lib/retention.js. Developer only. Nothing is drawn without it.
 */
export default function RetentionPanel({ retention, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!retention || retention.missing) return null;
  const { retention: back, daily } = retention;
  const nothing = daily.empty && back.newPlayers === 0;

  return (
    <section className={`${wrapClass} at-panel`} aria-label={title}>
      <div className={headClass}>
        <div>
          <h2 className="au-title">{title}</h2>
          {hint && <p className="au-hint">{hint}</p>}
        </div>
      </div>

      {nothing ? (
        <p className="au-empty">{emptyText}</p>
      ) : (
        <>
          <div className="at-tiles">
            <Tile label="Day 1" figure={back.d1} wait="Needs players first seen at least a day ago" />
            <Tile label="Day 7" figure={back.d7} wait="Needs players first seen at least 7 days ago" />
            <Tile label="Day 30" figure={back.d30} wait="Needs players first seen at least 30 days ago; pick a longer period" />
            <div className="at-tile">
              <span className="at-label">Players per day</span>
              <span className="at-value">{daily.average == null ? "—" : daily.average < 10 ? daily.average.toFixed(1) : Math.round(daily.average)}</span>
              <span className="at-sub">
                {daily.peak ? `peak ${formatCount(daily.peak.players)} on ${daily.peak.date}` : "no play yet"}; {formatCount(daily.newPlayers)} new
              </span>
            </div>
          </div>

          {daily.days.length > 1 && !daily.empty && <DailyBars days={daily.days} />}
        </>
      )}
    </section>
  );
}
