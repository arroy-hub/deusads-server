"use client";

import { formatCount } from "../../lib/analytics";

const percent = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);
const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);

/**
 * Does attention fall when the same player sees the same creative again (migration 0039)? `fatigue` is
 * { steps, summary, empty, missing } from lib/frequency.js. Used by the developer's Performance tab and the
 * advertiser's campaign report. Nothing is drawn without it.
 */
export default function FatiguePanel({ fatigue, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!fatigue || fatigue.missing) return null;
  const { steps, summary } = fatigue;

  return (
    <section className={`${wrapClass} at-panel`} aria-label={title}>
      <div className={headClass}>
        <div>
          <h2 className="au-title">{title}</h2>
          {hint && <p className="au-hint">{hint}</p>}
        </div>
      </div>

      {fatigue.empty ? (
        <p className="au-empty">{emptyText}</p>
      ) : (
        <>
          <div className="ov-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>The same player sees the same creative</th>
                  <th className="num">Views</th>
                  <th className="num">Average time seen</th>
                  <th className="num">Engaged views</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step) => (
                  <tr key={step.id}>
                    <td className="cr-strong">{step.label}</td>
                    <td className="num">{formatCount(step.views)}</td>
                    <td className="num">{seconds(step.avgSeconds)}</td>
                    <td className="num">{percent(step.engagedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="au-hint">
            {summary
              ? `From the 3rd time on, players look at the creative for ${seconds(summary.laterSeconds)} on average, against ${seconds(summary.firstSeconds)} the first time (${summary.change >= 0 ? "+" : "−"}${Math.abs(Math.round(summary.change * 100))}%).`
              : "Too few measured views yet to compare the first time with later ones."}
          </p>
        </>
      )}
    </section>
  );
}
