import Link from 'next/link';
import OverviewExplorer from './overview-explorer';
import OverviewDeck from './overview-deck';
import DownloadMenu from './download-menu';
import ReportFrame, { StatToggle } from './advertising/c/[campaignId]/report-frame';
import { Info } from './metrics-deck';
import { REPORT_RANGES } from '../../lib/reports';

/** The status of a campaign as a small coloured tag; the colour never carries the meaning alone. */
export { default as StatusPill } from './advertising/status-pill';

/**
 * The advertiser's Overview: the period, the headline numbers, the chart and the campaigns table on the left, the
 * Statistics panel (the widget board) at the right. What needs attention lives in the bell.
 */
export default function AdvertiserOverview({ data, basePath, deckLayout = null }) {
  const { days } = data;
  const series = data.dates.map((date, i) => ({ date, adv: data.campaigns.reduce((sum, item) => sum + (item.daily[i] || 0), 0) }));

  return (
    <div className='pg-ic pg-overview'>
      <div className='main-head'>
        <div>
          <h1>Overview</h1>
          <p className='lede'>How your ads are doing across all campaigns.</p>
        </div>
      </div>

      {data.missing && (
        <p className='notice'>
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      <ReportFrame
        initial={deckLayout}
        board={data.campaigns.length > 0 ? <OverviewDeck days={days} series={series} initial={deckLayout} scope='Across all your campaigns, whatever is ticked in the table.' /> : null}
      >
        <div className='cr-bar'>
          <nav className='ovx-seg' aria-label='Period for everything below'>
            {REPORT_RANGES.map((range) => (
              <Link key={range} href={`${basePath}?days=${range}`} title={`Last ${range} days`} aria-label={`Last ${range} days`} aria-current={range === days ? 'page' : undefined}>
                {range} days
              </Link>
            ))}
          </nav>
          <Info title='Period' text={`Everything below covers the last ${days} days. Changes are against the ${days} days before.`} />
          <span className='cr-bar-sp' />
          <DownloadMenu days={days} />
          <span className='cr-bar-div' aria-hidden='true' />
          <StatToggle />
        </div>
        <OverviewExplorer key={days} days={days} dates={data.dates} campaigns={data.campaigns} reach={data.reach ?? null} previous={data.previous ?? null} splitMissing={Boolean(data.splitMissing)} />
      </ReportFrame>
    </div>
  );
}
