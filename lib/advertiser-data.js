// Reads for the advertiser Overview and the campaign report. Only reads: nothing here writes.
// Every query is scoped to the advertiser's own id (the service client ignores row-level security).
// Columns and tables from later migrations are optional: without them the screen shows less, it does not fail.

import { isSchemaOutdated } from "./api.js";
import { fillDays } from "./analytics.js";
import { blockedCategories, controlMap, controlNote } from "./game-controls.js";
import { loadBookings } from "./bookings-data.js";
import {
  attentionItems,
  campaignStatus,
  controlLog,
  coverageSummary,
  creativeShape,
  deltaText,
  formatShare,
} from "./advertiser-overview.js";
import { targetingSummary } from "./targeting.js";
import { dateRangeText } from "./booking-rules.js";

const ZERO = { impressions: 0, sessions: 0, avg_visible_seconds: null, placements: 0 };

/**
 * Puts the developers' pauses and blocks on each live or waiting booking as `controlNote` (migration 0023).
 * Returns the raw control rows too, for the campaign report's log. Without the migration nothing is added.
 */
export async function attachControls(service, bookings) {
  const gameIds = [...new Set(bookings.map((booking) => booking.gameId).filter(Boolean))];
  if (!gameIds.length) return { controls: [] };
  const [controlRows, categoryRows] = await Promise.all([
    service.from("game_ad_controls").select("game_id, scope, target_id, state, reason, comment, changed_at").in("game_id", gameIds),
    service.from("game_category_blocks").select("game_id, category, blocked").in("game_id", gameIds),
  ]);
  if (controlRows.error || categoryRows.error) return { controls: [] };
  const perGame = new Map(
    gameIds.map((id) => [
      id,
      {
        controls: controlMap((controlRows.data ?? []).filter((row) => row.game_id === id)),
        blocked: blockedCategories((categoryRows.data ?? []).filter((row) => row.game_id === id)),
      },
    ])
  );
  for (const booking of bookings) {
    if (booking.status !== "approved" && booking.status !== "pending") continue;
    booking.controlNote = controlNote(
      { campaignId: booking.campaignId, advertiserId: booking.advertiserId, creativeId: booking.creativeId, category: booking.category },
      perGame.get(booking.gameId)
    );
  }
  return { controls: controlRows.data ?? [] };
}

/** The advertiser's creatives with the columns the coverage rules need (safe zone from migration 0017). */
async function readCreatives(service, userId) {
  const read = (columns) => service.from("creatives").select(columns).eq("owner_id", userId).neq("kind", "own").order("created_at", { ascending: false });
  let result = await read("id, name, status, review_note, width_px, height_px, safe_x, safe_y, safe_w, safe_h");
  if (isSchemaOutdated(result.error)) {
    result = await service
      .from("creatives")
      .select("id, name, status, review_note, width_px, height_px")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
  }
  return result.data ?? [];
}

/** Pictures made for a format, per creative, in the shape the coverage rules take. */
async function readAssets(service, creativeIds) {
  const byCreative = new Map();
  if (!creativeIds.length) return byCreative;
  const { data, error } = await service.from("creative_assets").select("creative_id, format_id, aspect, status").in("creative_id", creativeIds);
  if (error) return byCreative;
  for (const row of data ?? []) {
    if (!byCreative.has(row.creative_id)) byCreative.set(row.creative_id, []);
    byCreative.get(row.creative_id).push({ formatId: row.format_id, aspect: Number(row.aspect), status: row.status });
  }
  return byCreative;
}

/** Placements developers have opened to advertisers (shape only). An admin also sees their own, as in Find placements. */
async function readOpenPlacements(service, userId, role) {
  let query = service.from("placements").select("id, aspect_ratio").eq("open_to_advertisers", true).is("removed_at", null);
  if (role !== "admin") query = query.neq("owner_id", userId);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => ({ id: row.id, aspect: row.aspect_ratio == null ? null : Number(row.aspect_ratio) }));
}

/** Reports about the advertiser's creatives (migration 0024): the status and the reason only, never who sent it. */
async function readDisputes(service, creatives) {
  if (!creatives.length) return [];
  const { data, error } = await service
    .from("creative_disputes")
    .select("creative_id, reason, status, outcome, created_at")
    .in("creative_id", creatives.map((creative) => creative.id))
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  const nameOf = new Map(creatives.map((creative) => [creative.id, creative.name]));
  return (data ?? []).map((row) => ({ creativeId: row.creative_id, name: nameOf.get(row.creative_id) ?? "Creative", reason: row.reason, status: row.status, outcome: row.outcome }));
}

/** Who each creative is aimed at (migration 0018), as a short line; empty without the migration. */
async function readAudiences(service, creativeIds) {
  const map = new Map();
  if (!creativeIds.length) return map;
  const { data, error } = await service.from("creatives").select("id, targeting").in("id", creativeIds);
  if (error) return map;
  for (const row of data ?? []) map.set(row.id, targetingSummary(row.targeting));
  return map;
}

/** Everything the advertiser Overview shows for the last `days` days. */
export async function loadOverview(service, me, days) {
  const { user, role } = me;
  const args = { p_advertiser: user.id, p_campaign: null };
  const [bookingResult, campaignRows, creatives, openPlacements, totalsNow, totalsWide, dailyWide, placementStats] = await Promise.all([
    loadBookings(service, (query) => query.eq("advertiser_id", user.id), { limit: 500 }),
    service.from("campaigns").select("id, name, created_at").eq("advertiser_id", user.id).order("created_at", { ascending: false }),
    readCreatives(service, user.id),
    readOpenPlacements(service, user.id, role),
    service.rpc("advertiser_totals", { ...args, p_days: days }),
    service.rpc("advertiser_totals", { ...args, p_days: days * 2 }),
    service.rpc("advertiser_daily", { ...args, p_days: days * 2 }),
    service.rpc("advertiser_placement_stats", { ...args, p_days: days }),
  ]);
  const bookings = bookingResult.bookings;
  await attachControls(service, bookings);

  const [assetsOf, disputes, audienceOf] = await Promise.all([
    readAssets(service, creatives.map((creative) => creative.id)),
    readDisputes(service, creatives),
    readAudiences(service, creatives.map((creative) => creative.id)),
  ]);

  const totals = totalsNow.data?.[0] ?? ZERO;
  const wide = totalsWide.data?.[0] ?? ZERO;
  // The previous period is the wider window minus the current one; only counts can be subtracted (not averages or sessions).
  const previousImpressions = Math.max(0, Number(wide.impressions) - Number(totals.impressions));
  const both = fillDays(dailyWide.data, days * 2);
  const series = both.slice(days);

  // Where each (placement, creative) pair belongs: the newest booking names the campaign, as in the reports.
  const pairCampaign = new Map();
  for (const booking of bookings) {
    const key = `${booking.placementId}|${booking.creativeId}`;
    if (!pairCampaign.has(key)) pairCampaign.set(key, booking.campaignId);
  }
  const perCampaign = new Map();
  for (const item of placementStats.data ?? []) {
    const campaignId = pairCampaign.get(`${item.placement_id}|${item.creative_id}`);
    if (!campaignId) continue;
    const entry = perCampaign.get(campaignId) ?? { impressions: 0, weighted: 0, weight: 0 };
    const count = Number(item.impressions) || 0;
    entry.impressions += count;
    if (item.avg_visible_seconds != null) {
      entry.weighted += Number(item.avg_visible_seconds) * count;
      entry.weight += count;
    }
    perCampaign.set(campaignId, entry);
  }

  const campaigns = (campaignRows.data ?? []).map((campaign) => {
    const mine = bookings.filter((booking) => booking.campaignId === campaign.id);
    const status = campaignStatus(mine);
    const figures = perCampaign.get(campaign.id);
    const dates = mine.map((booking) => [booking.startsOn, booking.endsOn]);
    const starts = dates.map(([start]) => start).filter(Boolean).sort()[0] ?? null;
    const ends = dates.map(([, end]) => end).filter(Boolean).sort().at(-1) ?? null;
    const audiences = [...new Set(mine.map((booking) => audienceOf.get(booking.creativeId)).filter(Boolean))];
    return {
      id: campaign.id,
      name: campaign.name,
      status,
      dates: dateRangeText(starts, ends),
      audience: audiences[0] ?? "",
      games: new Set(mine.filter((booking) => booking.status === "approved").map((booking) => booking.gameId)).size,
      impressions: figures?.impressions ?? 0,
      avgVisible: figures && figures.weight > 0 ? figures.weighted / figures.weight : null,
    };
  });

  // Format gaps: for every creative that is approved or in use, the formats it cannot cover and the open placements that touches.
  const usedCreatives = new Set(bookings.filter((booking) => booking.status === "approved" || booking.status === "pending").map((booking) => booking.creativeId));
  const gaps = creatives
    .filter((creative) => creative.status !== "rejected" && (creative.status === "approved" || usedCreatives.has(creative.id)))
    .map((creative) => {
      const summary = coverageSummary({ creative: creativeShape(creative), assets: assetsOf.get(creative.id) ?? [], placements: openPlacements });
      return { id: creative.id, name: creative.name, missingLabels: summary.missingLabels, missingPlacements: summary.missingPlacements };
    });

  const attention = attentionItems({
    rejected: creatives.filter((creative) => creative.status === "rejected").map((creative) => ({ id: creative.id, name: creative.name, note: creative.review_note })),
    gaps,
    limited: campaigns.filter((campaign) => campaign.status.key === "limited" || campaign.status.key === "stopped").map((campaign) => ({ id: campaign.id, name: campaign.name, key: campaign.status.key, note: campaign.status.note })),
    disputes,
  });

  // Delivery by format: the shape of each placement that showed the ads.
  const statRows = placementStats.data ?? [];
  const aspectOf = new Map();
  if (statRows.length) {
    const { data: shapes } = await service.from("placements").select("id, aspect_ratio").in("id", [...new Set(statRows.map((item) => item.placement_id))]);
    for (const row of shapes ?? []) aspectOf.set(row.id, Number(row.aspect_ratio));
  }

  const liveGames = new Set(bookings.filter((booking) => booking.status === "approved").map((booking) => booking.gameId));
  const reachedGames = new Set(
    statRows
      .map((item) => bookings.find((booking) => booking.placementId === item.placement_id)?.gameId)
      .filter(Boolean)
  );

  return {
    days,
    missing: [totalsNow, dailyWide, placementStats].some((result) => result.error),
    totals,
    impressionsDelta: deltaText(totals.impressions, previousImpressions),
    series,
    formatShare: formatShare(statRows, aspectOf),
    campaigns,
    attention,
    gamesReached: reachedGames.size,
    gamesBooked: liveGames.size,
    hasCreatives: creatives.length > 0,
    hasCampaigns: campaigns.length > 0,
  };
}

/** The data of one campaign's report; null when the campaign is not the advertiser's. */
export async function loadCampaignReport(service, me, campaignId, days) {
  const { user } = me;
  const { data: campaign } = await service.from("campaigns").select("id, name, created_at").eq("id", campaignId).eq("advertiser_id", user.id).maybeSingle();
  if (!campaign) return null;

  const { bookings: all } = await loadBookings(service, (query) => query.eq("advertiser_id", user.id).eq("campaign_id", campaign.id), { limit: 500 });
  const { controls } = await attachControls(service, all);
  const status = campaignStatus(all);

  const args = { p_advertiser: user.id, p_campaign: campaign.id, p_days: days };
  const [totalsNow, daily, placementStats] = all.length
    ? await Promise.all([
        service.rpc("advertiser_totals", args),
        service.rpc("advertiser_daily", args),
        service.rpc("advertiser_placement_stats", args),
      ])
    : [{ data: [ZERO] }, { data: [] }, { data: [] }];

  const creativeIds = [...new Set(all.map((booking) => booking.creativeId))];
  const audienceOf = await readAudiences(service, creativeIds);
  const names = {
    games: new Map(all.map((booking) => [booking.gameId, booking.game])),
    creatives: new Map(all.map((booking) => [booking.creativeId, booking.creativeName])),
  };
  const starts = all.map((booking) => booking.startsOn).filter(Boolean).sort()[0] ?? null;
  const ends = all.map((booking) => booking.endsOn).filter(Boolean).sort().at(-1) ?? null;

  return {
    campaign,
    status,
    bookings: all,
    dates: dateRangeText(starts, ends),
    audience: [...new Set(creativeIds.map((id) => audienceOf.get(id)).filter(Boolean))][0] ?? "",
    creativeCount: creativeIds.length,
    totals: totalsNow.data?.[0] ?? ZERO,
    series: fillDays(daily.data, days),
    placementStats: placementStats.data ?? [],
    missing: [totalsNow, daily, placementStats].some((result) => result.error),
    log: controlLog({ controlRows: controls, campaignId: campaign.id, advertiserId: user.id, creativeIds, names }),
  };
}
