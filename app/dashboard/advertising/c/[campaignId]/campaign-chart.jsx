"use client";

import { useRef, useState } from "react";
import { formatCount, formatDay, niceMax } from "../../../../../lib/analytics";
import { weekdayDay } from "../../../../../lib/overview-chart";

const W = 720;
const H = 116;

/** The campaign's impressions per day: a line over a pale area, with the pauses and blocks marked on it. Hover for exact numbers. */
export default function CampaignChart({ series, events }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const count = series.length;
  const top = niceMax(Math.max(0, ...series.map((day) => day.impressions)));
  const x = (index) => (count > 1 ? (index / (count - 1)) * W : W / 2);
  const y = (value) => H - (value / top) * H;
  const points = series.map((day, index) => `${x(index).toFixed(1)},${y(day.impressions).toFixed(1)}`);
  const compact = (value) => (value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : String(Math.round(value)));
  const marks = events
    .map((event) => ({ ...event, index: series.findIndex((day) => day.date === event.date) }))
    .filter((event) => event.index >= 0 && event.kind !== "live");

  function move(event) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || count === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(count > 1 ? Math.round(ratio * (count - 1)) : 0);
  }

  return (
    <div className="cr-chart">
      <div className="cr-yaxis" aria-hidden="true">
        {[top, (top * 3) / 4, top / 2, top / 4, 0].map((tick) => (
          <span key={tick}>{compact(tick)}</span>
        ))}
      </div>
      <div className="cr-plot" ref={box} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Impressions per day, ${formatDay(series[0].date)} to ${formatDay(series[count - 1].date)}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <line key={step} x1="0" x2={W} y1={H - step * H + 0.5} y2={H - step * H + 0.5} stroke={step === 0 ? "#d3cfc8" : "#eceae6"} vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`${points.join(" ")} ${W},${H} 0,${H}`} fill="#f7e6e0" />
          <polyline points={points.join(" ")} fill="none" stroke="#b4472e" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {marks.map((event) => (
            <line key={`${event.date}-${event.label}`} x1={x(event.index)} x2={x(event.index)} y1="0" y2={H} stroke="#1c1b1a" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {marks.map((event, row) => (
          <span key={`${event.date}-${event.label}-name`} className="cr-mark-name" style={{ left: `${count > 1 ? (event.index / (count - 1)) * 100 : 50}%`, top: 2 + row * 24 }}>
            {formatDay(event.date)} · {event.label}
          </span>
        ))}
        {hover != null && (
          <>
            <div className="ovx-cursor cr-cursor" style={{ left: `${count > 1 ? (hover / (count - 1)) * 100 : 50}%` }} />
            <div className={`ovx-tip ${hover < count * 0.35 ? "is-right" : ""}`} style={{ left: `${count > 1 ? (hover / (count - 1)) * 100 : 50}%`, minWidth: 140 }} role="status">
              <b>{weekdayDay(series[hover].date)}</b>
              <div className="ovx-tip-row">
                <span>Impressions</span>
                <b>{formatCount(series[hover].impressions)}</b>
              </div>
            </div>
          </>
        )}
        <div className="cr-xaxis" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <span key={step}>{formatDay(series[Math.round(step * (count - 1))].date)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
