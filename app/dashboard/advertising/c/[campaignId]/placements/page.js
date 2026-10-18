import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignReport } from "../../../../../../lib/advertiser-data";
import { gameRows } from "../../../../../../lib/advertiser-overview";
import { formatCount } from "../../../../../../lib/analytics";
import { reportRows } from "../../../../../../lib/reports";
import PlacementsView, { FILTERS } from "./placements-view";
import { loadGameCards } from "../../../../../../lib/game-cards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign placements" };


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
  // What each game says about itself: the card the developer sees in the game's Settings, shown read-only from the name.
  const cards = await loadGameCards(me.service, games, (game) => placementsOf.get(game.id)?.size ?? 0, (game) => `${formatCount(game.impressions)} views of this campaign`);
  const placementTotal = [...placementsOf.values()].reduce((sum, map) => sum + map.size, 0);

  return (
    <PlacementsView
      campaignId={campaignId}
      report={report}
      games={games}
      shown={shown}
      filter={filter}
      count={count}
      placementsOf={placementsOf}
      skipped={skipped}
      placementTotal={placementTotal}
      cards={cards}
    />
  );
}
