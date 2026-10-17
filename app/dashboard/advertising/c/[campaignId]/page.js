import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/admin";
import { canAdvertise } from "../../../../../lib/admin-rules";
import { loadCampaignReport } from "../../../../../lib/advertiser-data";
import { deliveryNote, deltaText, gameRows } from "../../../../../lib/advertiser-overview";
import { formatCount, formatDay } from "../../../../../lib/analytics";
import { ratio } from "../../../../../lib/performance-view";
import { parseRange, reportRows } from "../../../../../lib/reports";
import CampaignChart from "./campaign-chart";
import { planCreativeIds } from "../../../../../lib/campaign-plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign report" };

const PILL = { showing: "live", paused: "paused", category: "paused", blocked: "blocked" };

/** "+0.4 s" / "−0.2 s" against the period before, or null. */
function deltaSeconds(now, before) {
  if (now == null || before == null) return null;
  const change = Math.round((now - before) * 10) / 10;
  if (change === 0) return { text: "no change", tone: "flat" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} s`, tone: change > 0 ? "up" : "down" };
}

export default async function CampaignReportPage({ params, searchParams }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();

  const query = await searchParams;
  const days = parseRange(query?.days);
  const report = await loadCampaignReport(me.service, me, campaignId, days);
  if (!report) notFound();

  const { campaign, status, bookings, totals, previous } = report;
  const rows = reportRows(bookings, report.placementStats);
  const games = gameRows(bookings, rows);
  const showing = games.filter((game) => game.state === "showing").length;
  const paused = games.filter((game) => game.state === "paused" || game.state === "category").length;
  const blocked = games.filter((game) => game.state === "blocked").length;
  const note = deliveryNote(games, status);
  const impressionsDelta = deltaText(totals.impressions, previous.impressions);
  const avgNow = totals.avg_visible_seconds == null ? null : Number(totals.avg_visible_seconds);
  const avgDelta = deltaSeconds(avgNow, previous.avgVisible);
  const hours = avgNow == null ? null : (avgNow * Number(totals.impressions)) / 3600;
  const heldLine = [paused > 0 ? `${paused} paused` : "", blocked > 0 ? `${blocked} with a blocked creative` : ""].filter(Boolean).join(" · ");
  const marks = report.events.filter((event) => event.kind !== "live");

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

      <section className="cr-cards" aria-label="Key numbers">
        <div className="cr-card">
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
        <div className="cr-card">
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
        <div className="cr-card">
          <span className="cr-card-label">Total visible time</span>
          <span className="cr-card-value">{hours == null ? "—" : `${hours.toFixed(1)} h`}</span>
          <span className="cr-card-sub ovx-muted">sum of seconds the ad was in view</span>
        </div>
        <div className="cr-card">
          <span className="cr-card-label">Games showing now</span>
          <span className="cr-card-value">
            {showing} <span className="cr-card-of">of {games.length}</span>
          </span>
          <span className="cr-card-sub ovx-muted">{heldLine || "none held back"}</span>
        </div>
      </section>

      <section className="cr-cards" aria-label="Reach">
        <div className="cr-card">
          <span className="cr-card-label">Players reached</span>
          <span className="cr-card-value">{report.reach.players > 0 ? formatCount(report.reach.players) : "—"}</span>
          <span className="cr-card-sub ovx-muted">{report.reach.players > 0 ? "different people who saw the ad" : "counted once games update the SDK"}</span>
        </div>
        <div className="cr-card">
          <span className="cr-card-label">Impressions per session</span>
          <span className="cr-card-value">{ratio(report.reach.perSession)}</span>
          <span className="cr-card-sub ovx-muted">{formatCount(report.reach.sessions)} sessions with the ad</span>
        </div>
        <div className="cr-card">
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
      </section>

      <section className="cr-table-box" aria-labelledby="cr-creatives">
        <div className="cr-box-head cr-pad">
          <div>
            <h2 id="cr-creatives">Which creative works better</h2>
            <p className="ovx-hint">Creatives rotate, so you can compare them over the same days.</p>
          </div>
        </div>
        {report.creativeRows.length === 0 ? (
          <p className="settings-help cr-pad">{planCreativeIds(report.campaign.plan).length > 0 ? "The creatives are attached. Figures appear here after their first impressions." : "No creatives in this campaign yet."}</p>
        ) : (
          <div className="ov-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Creative</th>
                  <th className="num">Impressions</th>
                  <th style={{ width: 140 }}>Share</th>
                  <th className="num">Avg view</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.creativeRows.map((item) => (
                  <tr key={item.id}>
                    <td className="cr-strong">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {item.url ? <img className="cr-thumb" src={item.url} alt="" /> : <span className="cr-thumb" />}
                      {item.name}
                    </td>
                    <td className="num">{item.impressions > 0 ? formatCount(item.impressions) : "—"}</td>
                    <td>
                      <span className="ov-share">
                        <span className="ov-bar-track" aria-hidden="true">
                          <span className="ov-bar-fill" style={{ width: `${Math.round(item.share * 100)}%` }} />
                        </span>
                        <span className="num">{Math.round(item.share * 100)}%</span>
                      </span>
                    </td>
                    <td className="num">{item.avgVisible == null ? "—" : `${item.avgVisible.toFixed(1)} s`}</td>
                    <td>{item.longer && <span className="ov-pill ov-live">Longer views</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="cr-split">
        <section className="cr-table-box cr-games" aria-labelledby="cr-games">
          <h2 id="cr-games" className="sr-only">
            Games
          </h2>
          {games.length === 0 ? (
            <p className="settings-help cr-pad">No placements in this campaign yet. Add some on the Placements tab.</p>
          ) : (
            <div className="ov-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Genre · Platform</th>
                    <th>Status in game</th>
                    <th className="num">Impressions</th>
                    <th style={{ width: 120 }}>Share</th>
                    <th className="num">Avg view</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => (
                    <tr key={game.id}>
                      <td className="cr-strong">{game.game}</td>
                      <td className="ovx-muted">{report.gameTags[game.id] || "—"}</td>
                      <td>
                        <span className={`ov-pill ov-${PILL[game.state] ?? "waiting"}`}>{game.label}</span>
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
      </div>
    </>
  );
}
