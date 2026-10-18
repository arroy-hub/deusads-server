import Link from "next/link";
import OverviewExplorer from "./overview-explorer";
import DownloadMenu from "./download-menu";
import { REPORT_RANGES } from "../../lib/reports";

/** The status of a campaign as a small coloured tag; the colour never carries the meaning alone. */
export { default as StatusPill } from "./advertising/status-pill";

/** The advertiser's Overview: the period, the headline numbers, the chart and the campaigns table. What needs attention lives in the bell. */
export default function AdvertiserOverview({ data, basePath, deckLayout = null }) {
  const { days } = data;

  return (
    <div className="pg-ic pg-overview">
      <div className="main-head">
        <div>
          <h1>Overview</h1>
          <p className="lede">How your ads are doing across all campaigns.</p>
        </div>
        <div className="head-actions fl-head-actions">
          <nav className="ovx-seg fl-period" aria-label="Period for everything below">
            {REPORT_RANGES.map((range) => (
              <Link key={range} href={`${basePath}?days=${range}`} title={`Last ${range} days`} aria-label={`Last ${range} days`} aria-current={range === days ? "page" : undefined}>
                {range}d
              </Link>
            ))}
          </nav>
          <DownloadMenu days={days} />
        </div>
      </div>

      {data.missing && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      <OverviewExplorer key={days} days={days} dates={data.dates} campaigns={data.campaigns} reach={data.reach ?? null} previous={data.previous ?? null} splitMissing={Boolean(data.splitMissing)} deckLayout={deckLayout} />
    </div>
  );
}
