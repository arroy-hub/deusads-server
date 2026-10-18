"use client";

import { formatCount } from "../../lib/analytics";

const percent = (value) => (value == null ? "—" : value > 0 && value < 0.1 ? `${(value * 100).toFixed(1)}%` : `${Math.round(value * 100)}%`);

/**
 * How many ads each player saw in the period (migration 0039). `frequency` is { players, views, untracked, avgFrequency,
 * repeatShare, buckets, empty, missing } from lib/frequency.js. Used by the developer's Performance tab and the
 * advertiser's campaign report. Nothing is drawn without it.
 */
export default function FrequencyPanel({ frequency, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!frequency || frequency.missing) return null;

  return (
    <section className={`${wrapClass} at-panel`} aria-label={title}>
      <div className={headClass}>
        <div>
          <h2 className="au-title">{title}</h2>
          {hint && <p className="au-hint">{hint}</p>}
        </div>
      </div>

      {frequency.empty ? (
        <p className="au-empty">{emptyText}</p>
      ) : (
        <>
          <div className="at-tiles">
            <div className="at-tile">
              <span className="at-label">Average frequency</span>
              <span className="at-value">{frequency.avgFrequency == null ? "—" : frequency.avgFrequency.toFixed(1)}</span>
              <span className="at-sub">ads seen per player</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Saw it more than once</span>
              <span className="at-value">{percent(frequency.repeatShare)}</span>
              <span className="at-sub">of {formatCount(frequency.players)} players</span>
            </div>
          </div>

          {frequency.players > 0 && (
            <div className="at-dist">
              {frequency.buckets.map((bucket) => (
                <div className="at-dist-row" key={bucket.id}>
                  <span className="at-dist-name" style={{ width: 84 }}>{bucket.label}</span>
                  <span className="au-bar at-dist-bar">
                    <span style={{ width: `${Math.round(bucket.share * 100)}%` }} />
                  </span>
                  <span className="au-num">
                    {formatCount(bucket.players)} players ({percent(bucket.share)})
                  </span>
                </div>
              ))}
            </div>
          )}

          {frequency.untracked > 0 && (
            <p className="au-hint">
              {formatCount(frequency.untracked)} more views came from games that do not identify players (SDK before 0.9); they are not part of these figures.
            </p>
          )}
        </>
      )}
    </section>
  );
}
