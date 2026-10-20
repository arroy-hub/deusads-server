import Link from 'next/link';
import { formatCount, formatDay } from '../../../../../lib/analytics';
import { ratio } from '../../../../../lib/performance-view';
import { REPORT_RANGES } from '../../../../../lib/reports';
import CampaignChart from './campaign-chart';
import CompareBox from './compare-box';
import ReportFrame, { StatToggle } from './report-frame';
import { Info } from '../../../metrics-deck';
import { planCreativeIds } from '../../../../../lib/campaign-plan';

/** '+0.4 s' / '−0.2 s' against the period before, or null. */
export function deltaSeconds(now, before) {
  if (now == null || before == null) return null;
  const change = Math.round((now - before) * 10) / 10;
  if (change === 0) return { text: 'no change', tone: 'flat' };
  return { text: `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)} s`, tone: change > 0 ? 'up' : 'down' };
}

// the small icons of the key numbers (same strokes as the mockup)
const ICON = {
  users: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .6 3.3 2.3 3.5 5.2',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  games: 'M3 7h18v11H3zM8 11v3M6.5 12.5h3',
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-6 15-6 16 0',
};

function Kpi({ icon, label, value, of, sub }) {
  return (
    <div className='cr-kpi'>
      <span className='cr-kpi-ic' aria-hidden='true'><svg width='16' height='16' viewBox='0 0 24 24'><path d={ICON[icon]} /></svg></span>
      <div>
        <span className='cr-kpi-label'>{label}</span>
        <span className='cr-kpi-value'>{value}{of ? <span className='cr-kpi-of'> {of}</span> : null}</span>
        <span className='cr-kpi-sub'>{sub}</span>
      </div>
    </div>
  );
}

const Delta = ({ d, days }) => (d ? <><b className={`ov-${d.tone}`}>{d.text}</b> vs previous {days} d</> : <>no previous period</>);

/** The campaign's Report tab, drawn from the figures page.js has read. A plain component so the page can be shown without a database. */
export default function ReportView({ report, days, deckLayout, totals, impressionsDelta, avgNow, avgDelta, hours, games, showing, heldLine, creativeRows, gameCompare, marks }) {
  const campaign = report.campaign;
  const base = `/dashboard/advertising/c/${campaign.id}`;
  const series = report.series;
  const best = series.reduce((top, day) => (day.impressions > (top?.impressions ?? -1) ? day : top), null);
  const perDay = series.length ? Number(totals.impressions) / series.length : 0;
  return (
    <>
      {report.missing && (
        <p className='notice'>
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      <ReportFrame initial={deckLayout} model={report} series={series.map((d) => ({ date: d.date, adv: d.impressions }))}>
        <div className='cr-bar'>
          <div className='ovx-seg' role='group' aria-label='Period'>
            {REPORT_RANGES.map((r) => <Link key={r} href={`${base}?days=${r}`} aria-current={r === days ? 'page' : undefined}>{r} days</Link>)}
          </div>
          <Info title='Period' text={`Everything below covers the last ${days} days. Changes are against the ${days} days before.`} />
          <span className='cr-bar-sp' />
          <a className='button button-quiet cr-bar-btn' href={`/dashboard/advertising/export?kind=placements&days=${days}&campaign=${campaign.id}`} download>
            <svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'><path d='M12 4v12M7 11l5 5 5-5M4 20h16' /></svg>
            Export CSV
          </a>
          <span className='cr-bar-div' aria-hidden='true' />
          <StatToggle />
        </div>

        <section className='cr-num' aria-label='Key numbers'>
          <div className='cr-num-hero'>
            <div>
              <span className='cr-hero-label'>Impressions</span>
              <div className='cr-hero-value'>{formatCount(totals.impressions)}</div>
              <div className='cr-hero-delta'>
                {impressionsDelta ? <span className={`cr-pill-delta ov-${impressionsDelta.tone}`}>{impressionsDelta.text}</span> : null}
                <span>{impressionsDelta ? `vs previous ${days} days` : 'no previous period'}</span>
              </div>
            </div>
            <div className='cr-hero-foot'>
              <div><span>Average per day</span><b>{formatCount(Math.round(perDay))}</b></div>
              <div><span>Best day{best ? ` · ${formatDay(best.date)}` : ''}</span><b>{best ? formatCount(best.impressions) : '—'}</b></div>
            </div>
          </div>
          <div className='cr-kpis'>
            <Kpi icon='users' label='Players reached' value={report.reach.players > 0 ? formatCount(report.reach.players) : '—'} sub={report.reach.players > 0 ? 'different people' : 'counted once games update the SDK'} />
            <Kpi icon='clock' label='Average view time' value={avgNow == null ? '—' : `${avgNow.toFixed(1)} s`} sub={<Delta d={avgDelta} days={days} />} />
            <Kpi icon='eye' label='Total visible time' value={hours == null ? '—' : `${hours.toFixed(1)} h`} sub='seconds in view, summed' />
            <Kpi icon='games' label='Games showing now' value={showing} of={`of ${games.length}`} sub={heldLine || 'none held back'} />
            <Kpi icon='pulse' label='Impressions per session' value={ratio(report.reach.perSession)} sub={`${formatCount(report.reach.sessions)} sessions`} />
            <Kpi icon='user' label='Impressions per player' value={ratio(report.reach.perPlayer)} sub='how often one player saw it' />
          </div>
        </section>

        <section className='cr-box cr-box-tight' data-fw='1' aria-labelledby='cr-daily'>
          <div className='cr-box-head'>
            <div className='cr-h2row'>
              <h2 id='cr-daily'>Impressions per day</h2>
              <Info title='Impressions per day' text='Impressions of this campaign for each day. The dashed line marks a pause or block by a developer.' />
            </div>
            <div className='cr-legend'>
              <span><i className='cr-legend-line' />This period</span>
              {marks.length > 0 && <span><i className='cr-legend-dash' />Pause or block</span>}
            </div>
          </div>
          <CampaignChart series={report.series} events={report.events} />
        </section>

        <CompareBox
          creatives={creativeRows}
          games={gameCompare}
          emptyCreatives={planCreativeIds(report.campaign.plan).length > 0 ? 'The creatives are attached. Figures appear here after their first impressions.' : 'No creatives in this campaign yet.'}
        />

        <section className='cr-table-box cr-log' data-fw='1' aria-labelledby='cr-log-title'>
          <div className='cr-h2row cr-pad'>
            <h2 id='cr-log-title'>Pauses and blocks</h2>
            <Info title='Pauses and blocks' text='What developers did to this campaign, and why. Blocks are reversible by the developer; you are notified when one is lifted.' />
          </div>
          {report.log.length === 0 ? (
            <p className='settings-help cr-pad'>Nothing is paused or blocked.</p>
          ) : (
            report.log.map((entry) => {
              const creative = entry.title.startsWith('Creative');
              return (
                <div className='cr-log-row' key={entry.key}>
                  <span className={`ov-pill ov-${entry.state === 'paused' ? 'paused' : 'blocked'}`}>{entry.title}</span>
                  {entry.at && <span className='cr-log-day'>{formatDay(entry.at)}</span>}
                  <strong>{entry.game}{entry.what ? ` · “${entry.what}”` : ''}</strong>
                  <span className='cr-log-why'>
                    {entry.reason ? `“${entry.reason}”` : 'No reason given by the developer.'} {creative ? 'Your other creatives still run in this game.' : 'Applies to this game only. Takes effect at the player’s next launch.'}
                  </span>
                  {creative ? (
                    <Link className='button button-quiet button-small' href={`${base}/creatives`}>Add another creative</Link>
                  ) : (
                    <Link className='button button-quiet button-small' href={`${base}/settings`}>Edit audience</Link>
                  )}
                </div>
              );
            })
          )}
        </section>
      </ReportFrame>
    </>
  );
}
