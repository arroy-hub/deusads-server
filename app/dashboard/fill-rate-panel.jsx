"use client";

import { formatCount } from "../../lib/analytics";

const percent = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);

/**
 * Fill rate (server, migration 0037): at each game start, how many placements got an ad and why the others stayed empty.
 * `fill` is { totals, places, reasons, missing } from lib/fill-rate.js. Developer only. Nothing is drawn without it.
 */
export default function FillRatePanel({ fill, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!fill || fill.missing) return null;
  const { totals, places, reasons } = fill;
  const nothing = totals.offered === 0;
  const lost = reasons.filter((reason) => reason.slots > 0).sort((a, b) => b.slots - a.slots);

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
              <span className="at-label">Fill rate</span>
              <span className="at-value">{percent(totals.rate)}</span>
              <span className="at-sub">
                {formatCount(totals.offered - totals.empty)} of {formatCount(totals.offered)} placement slots had an ad
              </span>
            </div>
            <div className="at-tile">
              <span className="at-label">Advertisers' ads</span>
              <span className="at-value">{percent(totals.adRate)}</span>
              <span className="at-sub">{formatCount(totals.filledAd)} slots; {formatCount(totals.filledOwn)} showed your own creatives</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Empty slots</span>
              <span className="at-value">{formatCount(totals.empty)}</span>
              <span className="at-sub">{totals.mainReason ? `mostly: ${totals.mainReason.label.toLowerCase()}` : "nothing was left empty"}</span>
            </div>
          </div>

          {lost.length > 0 && (
            <div className="ov-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Why a slot stayed empty</th>
                    <th className="num">Slots</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {lost.map((reason) => (
                    <tr key={reason.key}>
                      <td>
                        <span className="cr-strong">{reason.label}</span>
                        <span className="au-hint"> {reason.hint}</span>
                      </td>
                      <td className="num">{formatCount(reason.slots)}</td>
                      <td className="num">{percent(reason.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {places.length > 0 && (
            <div className="ov-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Placement</th>
                    <th className="num">Slots</th>
                    <th className="num">Fill rate</th>
                    <th className="num">Advertisers</th>
                    <th>Main reason when empty</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place) => (
                    <tr key={place.id}>
                      <td className="cr-strong">{place.name}</td>
                      <td className="num">{formatCount(place.offered)}</td>
                      <td className="num">{percent(place.rate)}</td>
                      <td className="num">{percent(place.adRate)}</td>
                      <td>{place.mainReason ? place.mainReason.label : "—"}</td>
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
