"use client";

import { formatCount } from "../../lib/analytics";

const percent = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);

/**
 * Interactions with objects that carry an ad (SDK 0.11+): the player took hold of, pressed or clicked them.
 * `interactions` is { totals, places, missing } from lib/interactions.js. The developer also gets a table per
 * placement (`places`); the advertiser gets totals. Nothing is drawn without it.
 */
export default function InteractionsPanel({ interactions, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!interactions || interactions.missing) return null;
  const { totals, places } = interactions;
  const nothing = totals.placements === 0;

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
            <div className="at-tile">
              <span className="at-label">Interaction rate</span>
              <span className="at-value">{percent(totals.rate)}</span>
              <span className="at-sub">
                {formatCount(totals.interacted)} of {formatCount(totals.views)} views ended with a touch
              </span>
            </div>
            <div className="at-tile">
              <span className="at-label">Interactions</span>
              <span className="at-value">{formatCount(totals.interactions)}</span>
              <span className="at-sub">{totals.perInteracted == null ? "grabs, presses and clicks" : `${totals.perInteracted.toFixed(1)} per view that had one`}</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Interactive placements</span>
              <span className="at-value">{formatCount(totals.placements)}</span>
              <span className="at-sub">objects the player can touch</span>
            </div>
          </div>

          {places.length > 0 && (
            <div className="ov-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Placement</th>
                    <th className="num">Views</th>
                    <th className="num">With a touch</th>
                    <th className="num">Rate</th>
                    <th className="num">Interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place) => (
                    <tr key={place.id}>
                      <td className="cr-strong">{place.name}</td>
                      <td className="num">{formatCount(place.views)}</td>
                      <td className="num">{formatCount(place.interacted)}</td>
                      <td className="num">{percent(place.rate)}</td>
                      <td className="num">{formatCount(place.interactions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
