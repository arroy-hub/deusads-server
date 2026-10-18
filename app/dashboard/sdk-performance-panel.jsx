"use client";

import { formatCount } from "../../lib/analytics";

const dash = "—";
const fps = (value) => (value == null ? dash : `${Math.round(value)}`);
const percent = (value) => (value == null ? dash : value > 0 && value < 0.1 ? `${(value * 100).toFixed(1)}%` : `${Math.round(value * 100)}%`);
const millis = (value) => (value == null ? dash : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`);
const perHour = (value) => (value == null ? dash : value < 10 ? value.toFixed(1) : `${Math.round(value)}`);
const minutes = (seconds) => (seconds < 90 ? `${Math.round(seconds)} s` : seconds < 5400 ? `${Math.round(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} h`);

function GroupTable({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <>
      <h3 className="sp-sub">{title}</h3>
      <div className="ov-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{title.replace("By ", "")}</th>
              <th className="num">Sessions</th>
              <th className="num">Average FPS</th>
              <th className="num">Slow frames</th>
              <th className="num">Stutters per hour</th>
              <th className="num">Worst frame</th>
              <th className="num">Creative load</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value ?? "__unknown__"}>
                <td className="cr-strong">{row.label}</td>
                <td className="num">{formatCount(row.sessions)}</td>
                <td className="num">{fps(row.fps)}</td>
                <td className="num">{percent(row.slowShare)}</td>
                <td className="num">{perHour(row.hitchesPerHour)}</td>
                <td className="num">{row.worstMs > 0 ? millis(row.worstMs) : dash}</td>
                <td className="num">{millis(row.loadAvgMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * How the game runs and how the SDK behaves inside it (SDK 0.11+, migration 0038): frame rate, stutters, how long
 * creatives take to get ready, and the SDK's own errors. `performance` is { total, platforms, devices, missing } from
 * lib/sdk-performance.js. Developer only: advertisers never see it. Nothing is drawn without it.
 */
export default function SdkPerformancePanel({ performance, title, hint, emptyText, wrapClass = "pf-panel", headClass = "pf-panel-head" }) {
  if (!performance || performance.missing) return null;
  const { total, platforms, devices } = performance;
  const nothing = total.sessions === 0;
  const compare = total.withAd.seconds >= 10 && total.withoutAd.seconds >= 10;
  const problems = total.problems.filter((problem) => problem.count > 0);

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
              <span className="at-label">Average FPS</span>
              <span className="at-value">{fps(total.fps)}</span>
              <span className="at-sub">
                {percent(total.slowShare)} of frames slower than 30 FPS, over {minutes(total.playHours * 3600)} of play in {formatCount(total.sessions)} sessions
              </span>
            </div>
            <div className="at-tile">
              <span className="at-label">Stutters</span>
              <span className="at-value">{perHour(total.hitchesPerHour)}</span>
              <span className="at-sub">per hour (frames over 100 ms); worst frame {total.worstMs > 0 ? millis(total.worstMs) : dash}</span>
            </div>
            <div className="at-tile">
              <span className="at-label">Creative load time</span>
              <span className="at-value">{millis(total.loadAvgMs)}</span>
              <span className="at-sub">
                {total.loads > 0 ? `${formatCount(total.loads)} downloaded, slowest ${millis(total.loadMaxMs)}` : "no downloads measured"}
                {total.cachedLoads > 0 ? `; from the device copy ${millis(total.cachedAvgMs)}` : ""}
              </span>
            </div>
            <div className="at-tile">
              <span className="at-label">SDK problems</span>
              <span className="at-value">{formatCount(total.problemCount)}</span>
              <span className="at-sub">
                {total.sessions > 0 ? `${((total.problemCount / total.sessions) * 100).toFixed(1)} per 100 sessions` : dash}
              </span>
            </div>
          </div>

          {compare && (
            <>
              <h3 className="sp-sub">With an ad in view and without</h3>
              <div className="ov-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Play</th>
                      <th className="num">Time</th>
                      <th className="num">Average FPS</th>
                      <th className="num">Slow frames</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="cr-strong">An ad is being looked at</td>
                      <td className="num">{minutes(total.withAd.seconds)}</td>
                      <td className="num">{fps(total.withAd.fps)}</td>
                      <td className="num">{percent(total.withAd.slowShare)}</td>
                    </tr>
                    <tr>
                      <td className="cr-strong">The rest of the play</td>
                      <td className="num">{minutes(total.withoutAd.seconds)}</td>
                      <td className="num">{fps(total.withoutAd.fps)}</td>
                      <td className="num">{percent(total.withoutAd.slowShare)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="au-hint">The two parts differ in what is on screen as well, so read this as a hint, not as the cost of the ads.</p>
            </>
          )}

          <h3 className="sp-sub">Problems</h3>
          {problems.length === 0 ? (
            <p className="au-hint">The SDK reported no problems.</p>
          ) : (
            <div className="ov-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>What happened</th>
                    <th className="num">Times</th>
                    <th className="num">Per 100 sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((problem) => (
                    <tr key={problem.key}>
                      <td>
                        <span className="cr-strong">{problem.label}</span>
                        <span className="au-hint"> {problem.hint}</span>
                      </td>
                      <td className="num">{formatCount(problem.count)}</td>
                      <td className="num">{problem.per100 == null ? dash : problem.per100.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <GroupTable title="By platform" rows={platforms} />
          <GroupTable title="By device" rows={devices} />
        </>
      )}
    </section>
  );
}
