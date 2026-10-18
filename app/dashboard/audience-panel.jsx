"use client";

import { useState } from "react";
import { formatCount } from "../../lib/analytics";
import { DIMENSIONS, audienceTable } from "../../lib/audience";
import { ratio } from "../../lib/performance-view";

const seconds = (value) => (value == null ? "—" : `${value.toFixed(1)} s`);

/**
 * Who the players are, one dimension at a time (platform, device, system, language, country).
 * The developer sees every announced session of the game; the advertiser sees only what his ads reached.
 * `audience` is { dimensions: { platform: rows, ... }, missing } from lib/audience.js; nothing is drawn without it.
 */
export default function AudiencePanel({ audience, kind, title, hint, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  const [dimension, setDimension] = useState("platform");
  if (!audience || audience.missing) return null;

  const rows = audienceTable(audience.dimensions?.[dimension], dimension, kind);
  const developer = kind === "developer";
  const onlyUnknown = rows.length > 0 && rows.every((row) => row.value == null);

  return (
    <section className={`${wrapClass} au-panel`} aria-label={title}>
      <div className={headClass}>
        <div>
          <h2 className="au-title">{title}</h2>
          {hint && <p className="au-hint">{hint}</p>}
        </div>
        <div className="pf-seg" role="group" aria-label="Split by">
          {DIMENSIONS.map((item) => (
            <button key={item.id} type="button" className="pf-seg-btn" aria-pressed={dimension === item.id} onClick={() => setDimension(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="au-empty">Nothing in this period yet.</p>
      ) : (
        <div className="ov-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{DIMENSIONS.find((item) => item.id === dimension)?.label}</th>
                <th style={{ width: 200 }}>{developer ? "Sessions" : "Impressions"}</th>
                <th className="num">Players</th>
                {developer ? <th className="num">Ad views per session</th> : <th className="num">Sessions</th>}
                <th className="num">Avg view</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.value ?? "__unknown__"}>
                  <td className="cr-strong">{row.label}</td>
                  <td>
                    <span className="au-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(row.share * 100, row.share > 0 ? 2 : 0)}%` }} />
                    </span>
                    <span className="au-num">
                      {formatCount(developer ? row.sessions : row.views)} · {Math.round(row.share * 100)}%
                    </span>
                  </td>
                  <td className="num">{row.players > 0 ? formatCount(row.players) : "—"}</td>
                  <td className="num">{developer ? ratio(row.perSession) : formatCount(row.sessions)}</td>
                  <td className="num">{seconds(row.avgView)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onlyUnknown && <p className="au-empty">The device details arrive with SDK 0.11 or newer, so older sessions are listed as Unknown.</p>}
    </section>
  );
}
