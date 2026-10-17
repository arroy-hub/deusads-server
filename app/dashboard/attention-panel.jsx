"use client";

import { formatCount } from "../../lib/analytics";
import { ENGAGED_METRES, ENGAGED_SECONDS, attentionFigures } from "../../lib/attention";

const percent = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);
const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);

/**
 * How well the ads were seen: chances, views, view time, distance and angle (SDK 0.11+).
 * `attention` is { row, missing } from lib/attention.js; nothing is drawn without it.
 */
export default function AttentionPanel({ attention, title, hint, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!attention || attention.missing) return null;
  const f = attentionFigures(attention.row);

  return (
    <section className={`${wrapClass} at-panel`} aria-label={title}>
      <div className={headClass}>
        <div>
          <h2 className="au-title">{title}</h2>
          {hint && <p className="au-hint">{hint}</p>}
        </div>
      </div>

      {f.empty ? (
        <p className="au-empty">Seen-time, distance and angle arrive with SDK 0.11 or newer. Nothing measured in this period yet.</p>
      ) : (
        <>
          <div className="at-tiles">
            <div className="at-tile">
              <span className="at-label">Chances to be seen</span>
              <span className="at-value">{f.opportunities > 0 ? formatCount(f.opportunities) : "—"}</span>
              <span className="at-sub">times an ad came into view</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Seen rate</span>
              <span className="at-value">{percent(f.viewability)}</span>
              <span className="at-sub">{formatCount(f.measured)} of them were looked at long enough</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Median view time</span>
              <span className="at-value">{seconds(f.medianSeconds)}</span>
              <span className="at-sub">half of the views were longer</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Engaged views</span>
              <span className="at-value">{percent(f.engagedRate)}</span>
              <span className="at-sub">
                {formatCount(f.engaged)} lasted {ENGAGED_SECONDS} s or more from {ENGAGED_METRES} m or closer
              </span>
            </div>
            <div className="at-tile">
              <span className="at-label">Average distance</span>
              <span className="at-value">{f.avgDistance == null ? "—" : `${f.avgDistance.toFixed(1)} m`}</span>
              <span className="at-sub">from the player to the banner</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Average angle</span>
              <span className="at-value">{f.avgAngle == null ? "—" : `${Math.round(f.avgAngle)}°`}</span>
              <span className="at-sub">0° is looking straight at it</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Share of the screen</span>
              <span className="at-value">{f.avgFraction == null ? "—" : percent(f.avgFraction)}</span>
              <span className="at-sub">how much of the view the banner covers</span>
            </div>
          </div>

          <div className="at-dist" role="group" aria-label="How long the views lasted">
            <span className="at-label">How long views lasted</span>
            {f.buckets.map((bucket) => (
              <div className="at-dist-row" key={bucket.id}>
                <span className="at-dist-name">{bucket.label}</span>
                <span className="au-bar at-dist-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(bucket.share * 100, bucket.share > 0 ? 2 : 0)}%` }} />
                </span>
                <span className="au-num">
                  {formatCount(bucket.count)} · {Math.round(bucket.share * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
