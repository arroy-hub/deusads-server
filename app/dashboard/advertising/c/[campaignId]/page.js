import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/admin";
import { canAdvertise } from "../../../../../lib/admin-rules";
import { loadCampaignReport } from "../../../../../lib/advertiser-data";
import { deliveryNote, deltaText, gameRows } from "../../../../../lib/advertiser-overview";
import { parseRange, reportRows } from "../../../../../lib/reports";
import ReportView, { deltaSeconds } from "./report-view";
import { compareFigures } from "../../../../../lib/campaign-compare";
import { loadGameCards } from "../../../../../lib/game-cards";
import { loadDeckLayout } from "../../../../../lib/deck-layout-data";
import { userClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign report" };

export default async function CampaignReportPage({ params, searchParams }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();

  const query = await searchParams;
  const days = parseRange(query?.days);
  const report = await loadCampaignReport(me.service, me, campaignId, days);
  const deckLayout = await loadDeckLayout(await userClient(), "advertiser");
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
  const cards = await loadGameCards(me.service, games);
  const creativeRows = report.creativeRows.map((item) => ({ ...item, f: report.compare.creatives[item.id] ?? compareFigures(null) }));
  const gameCompare = games.map((game) => ({ ...game, name: game.game, tags: report.gameTags[game.id] ?? "", card: cards[game.id], f: report.compare.games[game.id] ?? compareFigures(null) }));
  const marks = report.events.filter((event) => event.kind !== "live");

  return (
    <ReportView
      report={report}
      days={days}
      deckLayout={deckLayout}
      note={note}
      totals={totals}
      impressionsDelta={impressionsDelta}
      avgNow={avgNow}
      avgDelta={avgDelta}
      hours={hours}
      games={games}
      showing={showing}
      heldLine={heldLine}
      creativeRows={creativeRows}
      gameCompare={gameCompare}
      marks={marks}
    />
  );
}
