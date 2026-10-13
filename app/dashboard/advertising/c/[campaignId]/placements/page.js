import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignReport } from "../../../../../../lib/advertiser-data";
import { gameRows } from "../../../../../../lib/advertiser-overview";
import { formatCount } from "../../../../../../lib/analytics";
import { reportRows } from "../../../../../../lib/reports";
import { ratioLabel } from "../../../../../../lib/surface-math";
import ExcludeButton from "../exclude-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign placements" };

const FILTERS = [
  ["all", "All"],
  ["showing", "Showing"],
  ["held", "Paused or blocked"],
  ["excluded", "Excluded by me"],
];

export default async function CampaignPlacementsPage({ params, searchParams }) {
  const { campaignId } = await params;
  const query = await searchParams;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const report = await loadCampaignReport(me.service, me, campaignId, 30);
  if (!report) notFound();

  const open = report.bookings.filter((booking) => booking.status === "approved" || booking.status === "pending");
  const games = gameRows(report.bookings, reportRows(report.bookings, report.placementStats));
  const placementsOf = new Map();
  for (const booking of open) {
    if (!placementsOf.has(booking.gameId)) placementsOf.set(booking.gameId, new Map());
    placementsOf.get(booking.gameId).set(booking.placementId, booking);
  }
  const skipped = new Set(report.excludedGameIds ?? []);
  const isHeld = (game) => game.state === "paused" || game.state === "blocked" || game.state === "category";
  const filter = FILTERS.some(([key]) => key === query?.show) ? query.show : "all";
  const shown = games.filter((game) => (filter === "showing" ? game.state === "showing" && !skipped.has(game.id) : filter === "held" ? isHeld(game) : filter === "excluded" ? skipped.has(game.id) : true));
  const count = (key) => games.filter((game) => (key === "showing" ? game.state === "showing" && !skipped.has(game.id) : key === "held" ? isHeld(game) : key === "excluded" ? skipped.has(game.id) : true)).length;
  const placementTotal = [...placementsOf.values()].reduce((sum, map) => sum + map.size, 0);

  return (
    <>
      <section className="cp-aud" aria-label="Audience">
        <div>
          <h2>{report.audience ? "Chosen by audience" : "Every game"}</h2>
          <p>
            {report.audience ? `${report.audience}. ` : ""}New games that fit are added automatically.
          </p>
        </div>
        <div className="cp-aud-actions">
          <Link href={`/dashboard/advertising/c/${campaignId}/settings`} className="button button-quiet">
            Change audience
          </Link>
        </div>
      </section>

      <div className="cp-filter" role="group" aria-label="Filter">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/dashboard/advertising/c/${campaignId}/placements${key === "all" ? "" : `?show=${key}`}`} aria-current={filter === key ? "page" : undefined}>
            {label} <span>{count(key)}</span>
          </Link>
        ))}
      </div>

      {games.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>No placements in this campaign yet. Use “Add placements”.</p>
        </div>
      ) : (
        <section className="panel" style={{ padding: 0 }} aria-label="Games and placements">
          <div className="cp-sum">
            <span>
              {games.length} {games.length === 1 ? "game" : "games"} · {placementTotal} {placementTotal === 1 ? "placement" : "placements"}
            </span>
            <span>Impressions, 30 days</span>
          </div>
          {shown.map((game) => (
            <div className={`cp-game${skipped.has(game.id) ? " is-excluded" : ""}`} key={game.id}>
              <div className="cp-game-top">
                <div className="cp-game-name">
                  {game.game}
                  {report.gameTags?.[game.id] && <span className="cp-game-tags">{report.gameTags[game.id]}</span>}
                </div>
                {skipped.has(game.id) ? (
                  <span className="ov-pill ov-ended">Excluded by you</span>
                ) : (
                  <span className={`ov-pill ov-${game.state === "showing" ? "live" : game.state === "paused" || game.state === "category" ? "paused" : game.state === "blocked" ? "blocked" : "waiting"}`}>{game.label}</span>
                )}
<div className="cp-game-num">{game.impressions > 0 && !skipped.has(game.id) ? formatCount(game.impressions) : "—"}</div>
                {report.rules && placementsOf.has(game.id) && (
                  <ExcludeButton campaignId={campaignId} gameId={game.id} excluded={skipped.has(game.id)} />
                )}
              </div>
              {game.note && <p className="todo-sub">{game.note}</p>}
              <div className="cp-chips">
                {[...(placementsOf.get(game.id)?.values() ?? [])].map((booking) => (
                  <span className="cp-chip" key={booking.placementId}>
                    {booking.placement}
                    {booking.placementAspect ? <span className="muted num">{ratioLabel(booking.placementAspect)}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <p className="ovx-hint">Exclude a game to stop this campaign there, for example if it does not suit your brand. Unlike a developer’s block, you can undo it yourself at any time.</p>
    </>
  );
}
