import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import { loadBookings } from "../../../../lib/bookings-data";
import { fillDays, formatCount } from "../../../../lib/analytics";
import { REPORT_RANGES, parseRange, reportRows } from "../../../../lib/reports";
import DailyChart from "../../g/[gameId]/daily-chart";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }) {
  const me = await getMember();
  if (!me || (me.role !== "advertiser" && me.role !== "admin")) notFound();
  const { service, user } = me;

  const query = await searchParams;
  const days = parseRange(query?.days);

  const { bookings, error } = await loadBookings(service, (rows) => rows.eq("advertiser_id", user.id), {
    limit: 500,
  });

  // ?campaign= only counts when it is one of the caller's own campaigns
  const campaigns = [...new Map(bookings.map((b) => [b.campaignId, b.campaign])).entries()];
  const campaignId = campaigns.some(([id]) => id === query?.campaign) ? query.campaign : null;
  const scoped = campaignId ? bookings.filter((b) => b.campaignId === campaignId) : bookings;

  const args = { p_advertiser: user.id, p_days: days, p_campaign: campaignId };
  const [totalsResult, dailyResult, placementResult] = await Promise.all([
    service.rpc("advertiser_totals", args),
    service.rpc("advertiser_daily", args),
    service.rpc("advertiser_placement_stats", args),
  ]);
  const missing = [totalsResult, dailyResult, placementResult].some((result) => result.error);

  const totals = totalsResult.data?.[0] ?? { impressions: 0, sessions: 0, avg_visible_seconds: null, placements: 0 };
  const series = fillDays(dailyResult.data, days);
  const rows = reportRows(scoped, placementResult.data);

  const href = (next) => {
    const params = new URLSearchParams();
    params.set("days", String(next.days ?? days));
    const campaign = "campaign" in next ? next.campaign : campaignId;
    if (campaign) params.set("campaign", campaign);
    return `/dashboard/advertising/reports?${params}`;
  };

  return (
    <>
      <div className="main-head">
        <h1>Reports</h1>
        <Link href="/dashboard/advertising" className="button button-quiet">
          Campaigns
        </Link>
      </div>
      <p className="lede">
        How often your creatives were shown, and for how long they stayed in view. A view counts when a
        player had the placement on screen.
      </p>

      {(bookingsMissing(error) || missing) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and{" "}
          <code>0010_advertiser_reports.sql</code> in the Supabase SQL editor to turn reports on.
        </p>
      )}

      <nav className="subnav" aria-label="Report range">
        {REPORT_RANGES.map((range) => (
          <Link key={range} href={href({ days: range })} aria-current={range === days ? "page" : undefined}>
            {range} days
          </Link>
        ))}
        {campaigns.length > 0 && <span className="muted-line" style={{ marginLeft: "auto" }}>Campaign:</span>}
        {campaigns.length > 0 && (
          <>
            <Link href={href({ campaign: null })} aria-current={campaignId ? undefined : "page"}>
              All
            </Link>
            {campaigns.map(([id, name]) => (
              <Link key={id} href={href({ campaign: id })} aria-current={id === campaignId ? "page" : undefined}>
                {name}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="panel" style={{ marginBottom: "2rem" }}>
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
            <div className="figure-value">{formatCount(totals.placements)}</div>
            <div className="figure-label">Placements reached</div>
          </div>
          <div>
            <div className="figure-value">
              {totals.avg_visible_seconds == null ? "—" : `${Number(totals.avg_visible_seconds).toFixed(1)} s`}
            </div>
            <div className="figure-label">Avg. visible</div>
          </div>
        </div>
      </div>

      <section className="panel analytics" aria-labelledby="daily-title">
        <div className="analytics-head">
          <h2 id="daily-title">Impressions per day</h2>
          <span className="analytics-sub">Last {days} days · UTC</span>
        </div>
        <DailyChart days={series} />
      </section>

      <section className="panel analytics" aria-labelledby="by-placement-title" style={{ padding: 0 }}>
        <h2 id="by-placement-title" style={{ padding: "1.25rem 1.25rem 0.5rem" }}>
          By placement
        </h2>
        {rows.length ? (
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
                    {row.campaign && <span className="muted">{row.campaign}{row.live ? "" : " · stopped"}</span>}
                  </td>
                  <td>{row.creative}</td>
                  <td className="num">{formatCount(row.impressions)}</td>
                  <td className="num">{row.sessions == null ? "—" : formatCount(row.sessions)}</td>
                  <td className="num">{row.avgVisible == null ? "—" : `${row.avgVisible.toFixed(1)} s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="settings-help" style={{ padding: "0 1.25rem 1.25rem" }}>
            Nothing to report yet. Numbers appear once a booking is live and players see it.
          </p>
        )}
      </section>
    </>
  );
}
