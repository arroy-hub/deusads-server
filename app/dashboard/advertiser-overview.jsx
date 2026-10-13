import Link from "next/link";
import OverviewExplorer from "./overview-explorer";
import { formatDay } from "../../lib/analytics";
import { REPORT_RANGES } from "../../lib/reports";

/** The status of a campaign as a small coloured tag; the colour never carries the meaning alone. */
export { default as StatusPill } from "./advertising/status-pill";

/** The advertiser's Overview: the period, the headline numbers, the chart and the campaigns table. What needs attention lives in the bell. */
export default function AdvertiserOverview({ data, basePath }) {
  const { days } = data;

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Overview</h1>
          <p className="lede">How your ads are doing across all campaigns.</p>
        </div>
      </div>

      {data.missing && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      <nav className="ovx-period" aria-label="Period for everything below">
        <strong>Period</strong>
        <div className="ovx-seg">
          {REPORT_RANGES.map((range) => (
            <Link key={range} href={`${basePath}?days=${range}`} aria-current={range === days ? "page" : undefined}>
              {range} days
            </Link>
          ))}
        </div>
        <span className="ovx-muted">
          {formatDay(data.dates[0])} – {formatDay(data.dates[data.dates.length - 1])} · compared with the {days} days before · applies to the numbers, chart and table below
        </span>
      </nav>

      <OverviewExplorer key={days} days={days} dates={data.dates} campaigns={data.campaigns} previous={data.previous ?? null} splitMissing={Boolean(data.splitMissing)} />
    </>
  );
}
