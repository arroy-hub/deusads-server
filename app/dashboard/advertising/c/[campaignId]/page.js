import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/admin";
import { canAdvertise } from "../../../../../lib/admin-rules";
import { loadCampaignReport } from "../../../../../lib/advertiser-data";
import { gameRows } from "../../../../../lib/advertiser-overview";
import { formatCount, formatDay } from "../../../../../lib/analytics";
import { REPORT_RANGES, parseRange, reportRows } from "../../../../../lib/reports";
import DailyChart from "../../../g/[gameId]/daily-chart";
import { StatusPill } from "../../../advertiser-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign report" };

export default async function CampaignReportPage({ params, searchParams }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();

  const query = await searchParams;
  const days = parseRange(query?.days);
  const report = await loadCampaignReport(me.service, me, campaignId, days);
  if (!report) notFound();

  const { campaign, status, bookings, totals } = report;
  const rows = reportRows(bookings, report.placementStats);
  const games = gameRows(bookings, rows);
  const showing = games.filter((game) => game.state === "showing").length;
  const href = (next) => `/dashboard/advertising/c/${campaign.id}?days=${next}`;
  const exportHref = `/dashboard/advertising/reports/export?kind=placements&days=${days}&campaign=${campaign.id}`;
  const details = [report.dates, report.audience || "Every game", `${report.creativeCount} ${report.creativeCount === 1 ? "creative" : "creatives"}`].filter(Boolean);

  return (
    <>
      <div className="main-head">
        <div>
          <p className="muted-line">
            <Link href="/dashboard/advertising/overview" style={{ textDecoration: "underline" }}>
              Overview
            </Link>{" "}
            / Campaign
          </p>
          <div className="row">
            <h1>{campaign.name}</h1>
            <StatusPill status={status} />
          </div>
        </div>
        <div className="row">
          <a href={exportHref} className="button button-quiet" download>
            Download CSV
          </a>
          <Link href="/dashboard/advertising/new" className="button">
            Add placements
          </Link>
        </div>
      </div>
      <p className="lede">{details.join(" · ")}</p>

      {report.missing && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      {(status.key === "limited" || status.key === "stopped") && (
        <p className="notice" role="status">
          <strong>{status.key === "stopped" ? "This campaign is not showing." : "Delivery is limited."}</strong> {status.note}. The list below says
          which games and why.
        </p>
      )}

      <nav className="subnav" aria-label="Period">
        {REPORT_RANGES.map((range) => (
          <Link key={range} href={href(range)} aria-current={range === days ? "page" : undefined}>
            {range} days
          </Link>
        ))}
      </nav>

      <section className="panel" aria-label="Numbers">
        <div className="figures">
          <div>
            <div className="figure-value">{formatCount(totals.impressions)}</div>
            <div className="figure-label">Impressions</div>
          </div>
          <div>
            <div className="figure-value">{formatCount(totals.sessions)}</div>
            <div className="figure-label">Sessions</div>
          </div>
          <div>
            <div className="figure-value">{totals.avg_visible_seconds == null ? "—" : `${Number(totals.avg_visible_seconds).toFixed(1)} s`}</div>
            <div className="figure-label">Avg. visible</div>
          </div>
          <div>
            <div className="figure-value">
              {showing}
              <span className="ov-sub" style={{ display: "inline", marginLeft: "0.4rem", fontSize: "1rem" }}>
                of {games.length}
              </span>
            </div>
            <div className="figure-label">Games showing it now</div>
          </div>
        </div>
      </section>

      <section className="panel analytics" aria-labelledby="daily-title">
        <div className="analytics-head">
          <h2 id="daily-title">Impressions per day</h2>
          <span className="analytics-sub">Last {days} days · UTC</span>
        </div>
        <DailyChart days={report.series} />
      </section>

      <div className="home-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        <section className="panel" aria-labelledby="games-title" style={{ padding: 0, margin: 0 }}>
          <h2 id="games-title" style={{ padding: "1.25rem 1.25rem 0.5rem" }}>
            Games
          </h2>
          {games.length === 0 ? (
            <p className="settings-help" style={{ padding: "0 1.25rem 1.25rem" }}>
              No placements in this campaign yet. Add some under Find placements.
            </p>
          ) : (
            <div className="ov-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Status in game</th>
                    <th className="num">Impressions</th>
                    <th>Share</th>
                    <th className="num">Avg. visible</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => (
                    <tr key={game.id}>
                      <td>
                        <strong>{game.game}</strong>
                      </td>
                      <td>
                        <span className={`ov-pill ov-${game.state === "showing" ? "live" : game.state === "paused" || game.state === "category" ? "paused" : game.state === "blocked" ? "blocked" : "waiting"}`}>
                          {game.label}
                        </span>
                      </td>
                      <td className="num">{formatCount(game.impressions)}</td>
                      <td>
                        <span className="ov-share">
                          <span className="ov-bar-track" aria-hidden="true">
                            <span className="ov-bar-fill" style={{ width: `${Math.round(game.share * 100)}%` }} />
                          </span>
                          <span className="num">{Math.round(game.share * 100)}%</span>
                        </span>
                      </td>
                      <td className="num">{game.avgVisible == null ? "—" : `${game.avgVisible.toFixed(1)} s`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="log-title" style={{ margin: 0 }}>
          <h2 id="log-title">Pauses and blocks</h2>
          <p className="ov-note" style={{ marginTop: "0.25rem" }}>
            What developers switched off for this campaign, and why. A pause or block applies to one game and reaches players at their next launch.
          </p>
          {report.log.length === 0 ? (
            <p className="settings-help" style={{ marginTop: "1rem" }}>
              Nothing is paused or blocked.
            </p>
          ) : (
            <div className="ov-log" style={{ marginTop: "1rem" }}>
              {report.log.map((entry) => (
                <div className="ov-log-item" key={entry.key}>
                  <div className="ov-log-head">
                    <span className={`ov-pill ov-${entry.state === "paused" ? "paused" : "blocked"}`}>{entry.title}</span>
                    {entry.at && <span className="ov-log-date">{formatDay(entry.at.slice(0, 10))}</span>}
                  </div>
                  <strong>
                    {entry.game}
                    {entry.what ? ` · ${entry.what}` : ""}
                  </strong>
                  <span className="todo-sub">{entry.reason ? `Reason from the developer: “${entry.reason}”` : "The developer gave no reason."}</span>
                  {entry.comment && <span className="todo-sub">{entry.comment}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel analytics" aria-labelledby="by-placement-title" style={{ padding: 0, marginTop: "1.5rem" }}>
        <h2 id="by-placement-title" style={{ padding: "1.25rem 1.25rem 0.5rem" }}>
          By placement
        </h2>
        {rows.length ? (
          <div className="ov-table-wrap">
            <table className="placement-table">
              <thead>
                <tr>
                  <th>Placement</th>
                  <th>Creative</th>
                  <th className="num">Impressions</th>
                  <th className="num">Sessions</th>
                  <th className="num">Avg. visible</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.live || row.id === "removed" ? undefined : "is-removed"}>
                    <td>
                      {row.label}
                      {row.scene && <span className="muted">{row.scene}</span>}
                    </td>
                    <td>{row.creative}</td>
                    <td className="num">{formatCount(row.impressions)}</td>
                    <td className="num">{row.sessions == null ? "—" : formatCount(row.sessions)}</td>
                    <td className="num">{row.avgVisible == null ? "—" : `${row.avgVisible.toFixed(1)} s`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="settings-help" style={{ padding: "0 1.25rem 1.25rem" }}>
            Nothing to report yet. Numbers appear once a booking is live and players see it.
          </p>
        )}
      </section>
    </>
  );
}
