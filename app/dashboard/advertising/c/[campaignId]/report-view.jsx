import Link from "next/link";
import { formatCount, formatDay } from "../../../../../lib/analytics";
import { ratio } from "../../../../../lib/performance-view";
import CampaignChart from "./campaign-chart";
import CompareBox from "./compare-box";
import DeckBoard from "../../../deck-board";
import { planCreativeIds } from "../../../../../lib/campaign-plan";

/** "+0.4 s" / "−0.2 s" against the period before, or null. */
export function deltaSeconds(now, before) {
  if (now == null || before == null) return null;
  const change = Math.round((now - before) * 10) / 10;
  if (change === 0) return { text: "no change", tone: "flat" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} s`, tone: change > 0 ? "up" : "down" };
}

/** The campaign's Report tab, drawn from the figures page.js has read. A plain component so the page can be shown without a database. */
export default function ReportView({ report, days, deckLayout, note, totals, impressionsDelta, avgNow, avgDelta, hours, games, showing, heldLine, creativeRows, gameCompare, marks }) {
  const campaign = report.campaign;
  return (
    <>
      {report.missing && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> and <code>0010_advertiser_reports.sql</code> in the
          Supabase SQL editor to turn the numbers on.
        </p>
      )}

      {note && (
        <div className="cr-alert" role="status">
          <span aria-hidden="true">!</span>
          <p>
            <b>{note.lead}</b> {note.text}
          </p>
        </div>
      )}

      <section className="cr-sum" aria-label="Key numbers">
        <div className="cr-sum-hero">
          <span className="cr-card-label">Impressions</span>
          <span className="cr-card-value">{formatCount(totals.impressions)}</span>
          <span className="cr-card-sub">
            {impressionsDelta ? (
              <>
                <b className={`ov-${impressionsDelta.tone}`}>{impressionsDelta.text}</b> <span className="ovx-muted">vs previous {days} days</span>
              </>
            ) : (
              <span className="ovx-muted">no previous period</span>
            )}
          </span>
        </div>
        <div className="cr-sum-cell">
          <span className="cr-card-label">Average view time</span>
          <span className="cr-card-value">{avgNow == null ? "—" : `${avgNow.toFixed(1)} s`}</span>
          <span className="cr-card-sub">
            {avgDelta ? (
              <>
                <b className={`ov-${avgDelta.tone}`}>{avgDelta.text}</b> <span className="ovx-muted">vs previous {days} days</span>
              </>
            ) : (
              <span className="ovx-muted">no previous period</span>
            )}
          </span>
        </div>
        <div className="cr-sum-cell">
          <span className="cr-card-label">Total visible time</span>
          <span className="cr-card-value">{hours == null ? "—" : `${hours.toFixed(1)} h`}</span>
          <span className="cr-card-sub ovx-muted">sum of seconds the ad was in view</span>
        </div>
        <div className="cr-sum-cell">
          <span className="cr-card-label">Games showing now</span>
          <span className="cr-card-value">
            {showing} <span className="cr-card-of">of {games.length}</span>
          </span>
          <span className="cr-card-sub ovx-muted">{heldLine || "none held back"}</span>
        </div>
        <div className="cr-sum-cell">
          <span className="cr-card-label">Players reached</span>
          <span className="cr-card-value">{report.reach.players > 0 ? formatCount(report.reach.players) : "—"}</span>
          <span className="cr-card-sub ovx-muted">{report.reach.players > 0 ? "different people who saw the ad" : "counted once games update the SDK"}</span>
        </div>
        <div className="cr-sum-cell">
          <span className="cr-card-label">Impressions per session</span>
          <span className="cr-card-value">{ratio(report.reach.perSession)}</span>
          <span className="cr-card-sub ovx-muted">{formatCount(report.reach.sessions)} sessions where the ad was seen</span>
        </div>
        <div className="cr-sum-cell">
          <span className="cr-card-label">Impressions per player</span>
          <span className="cr-card-value">{ratio(report.reach.perPlayer)}</span>
          <span className="cr-card-sub ovx-muted">how often one player saw it</span>
        </div>
      </section>

      <section className="cr-box" aria-labelledby="cr-daily">
        <div className="cr-box-head">
          <h2 id="cr-daily">Impressions per day</h2>
          <div className="cr-legend">
            <span>
              <svg width="18" height="4" aria-hidden="true">
                <line x1="0" y1="2" x2="18" y2="2" stroke="#b4472e" strokeWidth="3" />
              </svg>
              This period
            </span>
            {marks.length > 0 && (
              <span>
                <svg width="18" height="12" aria-hidden="true">
                  <line x1="9" y1="0" x2="9" y2="12" stroke="#1c1b1a" strokeWidth="1.5" strokeDasharray="3 2" />
                </svg>
                Pause or block
              </span>
            )}
          </div>
        </div>
        <CampaignChart series={report.series} events={report.events} />
        <DeckBoard
          kind="advertiser"
          model={report}
          days={report.series.map((d) => ({ date: d.date, adv: d.impressions }))}
          initial={deckLayout}
        />
      </section>

      <CompareBox
        creatives={creativeRows}
        games={gameCompare}
        emptyCreatives={planCreativeIds(report.campaign.plan).length > 0 ? "The creatives are attached. Figures appear here after their first impressions." : "No creatives in this campaign yet."}
      />

      <section className="cr-table-box cr-log" aria-labelledby="cr-log-title">
        <div className="cr-pad">
          <h2 id="cr-log-title">Pauses and blocks</h2>
          <p className="ovx-hint">What developers did to this campaign, and why.</p>
        </div>
        {report.log.length === 0 ? (
          <p className="settings-help cr-pad">Nothing is paused or blocked.</p>
        ) : (
          report.log.map((entry) => (
            <div className="cr-log-item" key={entry.key}>
              <div className="cr-log-head">
                <span className={`ov-pill ov-${entry.state === "paused" ? "paused" : "blocked"}`}>{entry.title}</span>
                {entry.at && <span className="ovx-hint">{formatDay(entry.at)}</span>}
              </div>
              <strong>
                {entry.game}
                {entry.what ? ` · “${entry.what}”` : ""}
              </strong>
              <span className="ovx-muted">{entry.reason ? `Reason from the developer: “${entry.reason}”` : "No reason given by the developer."}</span>
              <span className="ovx-hint">
                {entry.title.startsWith("Creative") ? "Your other creatives still run in this game." : "Applies to this game only. Takes effect at the player’s next launch."}
              </span>
              {entry.title.startsWith("Creative") ? (
                <Link className="button button-quiet button-small" href={`/dashboard/advertising/c/${campaign.id}/creatives`}>
                  Add another creative
                </Link>
              ) : (
                <Link className="button button-quiet button-small" href={`/dashboard/advertising/c/${campaign.id}/settings`}>
                  Edit audience
                </Link>
              )}
            </div>
          ))
        )}
        <p className="ovx-hint cr-pad cr-log-foot">Blocks are reversible by the developer. You are notified when one is lifted.</p>
      </section>
    </>
  );
}
