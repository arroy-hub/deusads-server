"use client";

import { formatCount } from "../../lib/analytics";

const percent = (value) => (value == null ? "—" : value > 0 && value < 0.1 ? `${(value * 100).toFixed(1)}%` : `${Math.round(value * 100)}%`);
const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);

/**
 * Views split by where in the game (scene) or when in the session (minute) they were seen (migration 0041). `context` is
 * { rows, views, summary, empty, missing } from lib/context.js; `first` names the first column. Used by the developer's
 * Performance tab (scenes and minutes) and the advertiser's campaign report (minutes). Nothing is drawn without it.
 */
export default function ContextPanel({ context, first, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!context || context.missing) return null;

  return (
    <section className={`${wrapClass} at-panel`} aria-label={title}>
      <div className={headClass}>
        <div>
          <h2 className="au-title">{title}</h2>
          {hint && <p className="au-hint">{hint}</p>}
        </div>
      </div>

      {context.empty ? (
        <p className="au-empty">{emptyText}</p>
      ) : (
        <>
          <div className="ov-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{first}</th>
                  <th className="num">Views</th>
                  <th className="num">Average time seen</th>
                  <th className="num">Engaged views</th>
                </tr>
              </thead>
              <tbody>
                {context.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="cr-strong">{row.label}</td>
                    <td className="num">
                      {formatCount(row.views)}
                      <span className="muted-line"> {percent(row.share)}</span>
                    </td>
                    <td className="num" title={row.thin ? "Only a few measured views" : undefined}>
                      {seconds(row.avgSeconds)}
                      {row.thin ? " *" : ""}
                    </td>
                    <td className="num">{percent(row.engagedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {context.rows.some((row) => row.thin) && <p className="au-hint">* Based on only a few measured views.</p>}
          {context.summary && (
            <p className="au-hint">
              {`After the 10th minute players look at the ad for ${seconds(context.summary.late)} on average, against ${seconds(context.summary.early)} in the first two minutes (${context.summary.change >= 0 ? "+" : "−"}${Math.abs(Math.round(context.summary.change * 100))}%).`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
