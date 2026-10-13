import Link from "next/link";
import DailyChart from "./g/[gameId]/daily-chart";
import { formatCount } from "../../lib/analytics";
import { REPORT_RANGES } from "../../lib/reports";

/** The status of a campaign as a small coloured tag; the colour never carries the meaning alone. */
export function StatusPill({ status }) {
  return <span className={`ov-pill ov-${status.key}`}>{status.label}</span>;
}

/** The advertiser's Overview: what needs attention, the headline numbers, the daily chart, delivery by format, campaigns. */
export default function AdvertiserOverview({ data, basePath }) {
  const { days, totals, attention, campaigns } = data;
  const delta = data.impressionsDelta;

  return (
    <>
      <div className="main-head">
        <h1>Overview</h1>
        <div className="row">
          <Link href="/dashboard/advertising/reports" className="button button-quiet">
            Reports
          </Link>
          <Link href="/dashboard/advertising/new" className="button">
            New campaign
          </Link>
        </div>
      </div>
      <p className="lede">
        What needs your attention, how your ads are doing, and where each campaign stands. Developers can pause or
        block an ad in their game; you see where and why.
      </p>

      <nav className="subnav" aria-label="Period">
        {REPORT_RANGES.map((range) => (
          <Link key={range} href={`${basePath}?days=${range}`} aria-current={range === days ? "page" : undefined}>
            {range} days
          </Link>
        ))}
      </nav>

      {data.missing && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      {(!data.hasCreatives || !data.hasCampaigns) && (
        <section className="panel" aria-labelledby="start-title">
          <h2 id="start-title">Get your first ad running</h2>
          {!data.hasCreatives && (
            <div className="todo">
              <div>
                <strong>Start your first campaign</strong>
                <div className="todo-sub">Upload a creative and choose where it runs. Ads start once the creative is approved.</div>
              </div>
              <Link href="/dashboard/advertising/new" className="button">
                New campaign
              </Link>
            </div>
          )}
          {data.hasCreatives && !data.hasCampaigns && (
            <div className="todo">
              <div>
                <strong>Start a campaign with it</strong>
                <div className="todo-sub">Pick a creative and the placements, then start a campaign.</div>
              </div>
              <Link href="/dashboard/advertising/new" className="button">
                New campaign
              </Link>
            </div>
          )}
        </section>
      )}

      {attention.length > 0 && (
        <section className="panel" aria-labelledby="attention-title">
          <h2 id="attention-title">Needs your attention</h2>
          <div className="ov-attention">
            {attention.map((item) => (
              <div className="ov-card" key={item.key}>
                <span className={`ov-pill ov-${item.tone}`}>{item.tag}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
                <Link href={item.href} className="ov-link">
                  {item.action} →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="numbers-title">
        <h2 id="numbers-title" className="sr-only">
          Last {days} days
        </h2>
        <div className="figures">
          <div>
            <div className="figure-value">{formatCount(totals.impressions)}</div>
            <div className="figure-label">Impressions</div>
            {delta && (
              <div className="ov-delta-line">
                <span className={`ov-${delta.tone}`}>{delta.text}</span> vs previous {days} days
              </div>
            )}
          </div>
          <div>
            <div className="figure-value">{formatCount(totals.sessions)}</div>
            <div className="figure-label">Sessions</div>
          </div>
          <div>
            <div className="figure-value">
              {totals.avg_visible_seconds == null ? "—" : `${Number(totals.avg_visible_seconds).toFixed(1)} s`}
            </div>
            <div className="figure-label">Avg. visible</div>
          </div>
          <div>
            <div className="figure-value">
              {formatCount(data.gamesReached)}
              <span className="ov-sub" style={{ display: "inline", marginLeft: "0.4rem", fontSize: "1rem" }}>
                of {formatCount(data.gamesBooked)}
              </span>
            </div>
            <div className="figure-label">Games reached</div>
          </div>
        </div>
      </section>

      <div className="home-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <section className="panel analytics" aria-labelledby="daily-title" style={{ margin: 0 }}>
          <div className="analytics-head">
            <h2 id="daily-title">Impressions per day</h2>
            <span className="analytics-sub">Last {days} days · UTC</span>
          </div>
          <DailyChart days={data.series} />
        </section>

        <section className="panel" aria-labelledby="format-title" style={{ margin: 0 }}>
          <h2 id="format-title">Delivery by format</h2>
          <div className="ov-bars">
            {data.formatShare.map((row) => (
              <div className="ov-bar-row" key={row.id}>
                <span className="num">{row.label}</span>
                <span className="ov-bar-track" role="img" aria-label={`${row.label}: ${Math.round(row.share * 100)}% of impressions`}>
                  <span className="ov-bar-fill" style={{ width: `${Math.round(row.share * 100)}%` }} />
                </span>
                <span className="num">{Math.round(row.share * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="ov-note">Share of impressions by placement shape. A format with 0% either has no placements or no picture for it.</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="campaigns-title" style={{ padding: 0, marginTop: "1.5rem" }}>
        <div className="analytics-head" style={{ padding: "1.25rem 1.25rem 0.5rem" }}>
          <h2 id="campaigns-title">Campaigns</h2>
          <Link href="/dashboard/advertising" className="link-button">
            All campaigns
          </Link>
        </div>
        {campaigns.length === 0 ? (
          <p className="settings-help" style={{ padding: "0 1.25rem 1.25rem" }}>
            No campaigns yet.
          </p>
        ) : (
          <div className="ov-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Dates</th>
                  <th>Audience</th>
                  <th className="num">Games</th>
                  <th className="num">Impressions</th>
                  <th className="num">Avg. visible</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className="ov-name">
                      <Link href={`/dashboard/advertising/c/${campaign.id}`}>{campaign.name}</Link>
                    </td>
                    <td>
                      <StatusPill status={campaign.status} />
                      {campaign.status.note && <span className="ov-sub">{campaign.status.note}</span>}
                    </td>
                    <td>{campaign.dates || "—"}</td>
                    <td>{campaign.audience || "Every game"}</td>
                    <td className="num">{campaign.games || "—"}</td>
                    <td className="num">{formatCount(campaign.impressions)}</td>
                    <td className="num">{campaign.avgVisible == null ? "—" : `${campaign.avgVisible.toFixed(1)} s`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
