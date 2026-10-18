// Reads for the advertiser Overview and the campaign report. Only reads: nothing here writes.
// Every query is scoped to the advertiser's own id (the service client ignores row-level security).
// Columns and tables from later migrations are optional: without them the screen shows less, it does not fail.

import { compareByKind } from "./campaign-compare.js";
import { isSchemaOutdated } from "./api.js";
import { loadAudience } from "./audience.js";
import { loadAttention as loadViewFigures } from "./attention.js";
import { loadAdvertiserInteractions } from "./interactions.js";
import { loadFatigue, loadFrequency } from "./frequency.js";
import { loadMinutes } from "./context.js";
import { fillDays } from "./analytics.js";
import { blockedCategories, controlMap, controlNote } from "./game-controls.js";
import { loadBookings } from "./bookings-data.js";
import {
  attentionItems,
  campaignStatus,
  controlLog,
  coverageSummary,
  creativeComparison,
  creativeShape,
} from "./advertiser-overview.js";
import { hasTargeting, labelOf, targetingSummary } from "./targeting.js";
import { FORMATS, coverageByFormat } from "./formats.js";
import { orderCreatives } from "./creative-library.js";
import { buildSplits } from "./overview-chart.js";
import { dateRangeText } from "./booking-rules.js";
import { canAdvertise } from "./admin-rules.js";
import { effectivePause } from "./campaign-rules.js";
import { planCreativeIds } from "./campaign-plan.js";
import { reachFigures } from "./reach.js";

const ZERO = { impressions: 0, sessions: 0, avg_visible_seconds: null, placements: 0, players: 0, player_views: 0 };

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

/**
 * The advertiser's creatives with the columns the coverage rules need (safe zone from migration 0017) and, from
 * migration 0028, the folder, the advertiser's own order and the framing per shape.
 */
async function readCreatives(service, userId) {
  const read = (columns) => service.from("creatives").select(columns).eq("owner_id", userId).neq("kind", "own").order("created_at", { ascending: false });
  const base = "id, name, status, review_note, created_at, width_px, height_px, safe_x, safe_y, safe_w, safe_h";
  let result = await read(`${base}, folder_id, sort_index, format_crops`);
  if (isSchemaOutdated(result.error)) result = await read(base);
  if (isSchemaOutdated(result.error)) {
    result = await service
      .from("creatives")
      .select("id, name, status, review_note, created_at, width_px, height_px")
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

/**
 * The advertiser's campaigns with the rules from migration 0026 (audience, pause, draft plan). Without the migration
 * the plain columns load and `rules` is false, so the screens can say what needs it.
 */
async function readCampaigns(service, userId, { id = null, order = true } = {}) {
  const read = (columns) => {
    let query = service.from("campaigns").select(columns).eq("advertiser_id", userId);
    if (id) query = query.eq("id", id);
    return order ? query.order("created_at", { ascending: false }) : query;
  };
  // resume_on (migration 0028) ends a pause by itself: once its day has come the campaign counts as running again.
  let result = await read("id, name, created_at, targeting, paused_at, plan, resume_on");
  let rules = true;
  if (isSchemaOutdated(result.error)) result = await read("id, name, created_at, targeting, paused_at, plan");
  if (isSchemaOutdated(result.error)) {
    rules = false;
    result = await read("id, name, created_at");
  }
  return {
    rows: (result.data ?? []).map((row) => {
      const paused = effectivePause(row.paused_at ?? null, row.resume_on ?? null);
      return { ...row, targeting: row.targeting ?? null, paused_at: paused, pausedUntil: paused ? row.resume_on ?? null : null, plan: row.plan ?? null };
    }),
    rules,
    error: result.error,
  };
}

/** What campaignStatus needs to know about a campaign row. */
function campaignFlags(campaign) {
  return { paused: Boolean(campaign.paused_at), launched: Boolean(campaign.plan?.launched), stopped: Boolean(campaign.plan?.stoppedAt) };
}

/** The audience line of a campaign: its own audience when it has one, else what its creatives are aimed at. */
function audienceLine(campaign, fromCreatives) {
  return hasTargeting(campaign.targeting) ? targetingSummary(campaign.targeting) : fromCreatives ?? "";
}

/** The dates a campaign runs between, from its bookings: the earliest start and the latest end (either may be null). */
function campaignSpan(bookings) {
  const starts = bookings.map((booking) => booking.startsOn).filter(Boolean).sort()[0] ?? null;
  const ends = bookings.map((booking) => booking.endsOn).filter(Boolean).sort().at(-1) ?? null;
  return { starts, ends };
}

/**
 * What needs the advertiser's attention, for the bell: rejected creatives, reports, campaigns limited by
 * developers, format gaps and campaigns about to end. Reads only; fewer queries than the whole Overview.
 */
export async function loadAttention(service, me) {
  const { user, role } = me;
  const [bookingResult, campaignRows, creatives, openPlacements] = await Promise.all([
    loadBookings(service, (query) => query.eq("advertiser_id", user.id), { limit: 500 }),
    readCampaigns(service, user.id, { order: false }),
    readCreatives(service, user.id),
    readOpenPlacements(service, user.id, role),
  ]);
  const bookings = bookingResult.bookings;
  await attachControls(service, bookings);
  const [assetsOf, disputes] = await Promise.all([
    readAssets(service, creatives.map((creative) => creative.id)),
    readDisputes(service, creatives),
  ]);

  const campaigns = campaignRows.rows.map((campaign) => {
    const mine = bookings.filter((booking) => booking.campaignId === campaign.id);
    return { id: campaign.id, name: campaign.name, status: campaignStatus(mine, campaignFlags(campaign)), ends: campaignSpan(mine).ends };
  });

  const usedCreatives = new Set(bookings.filter((booking) => booking.status === "approved" || booking.status === "pending").map((booking) => booking.creativeId));
  const gaps = creatives
    .filter((creative) => creative.status !== "rejected" && (creative.status === "approved" || usedCreatives.has(creative.id)))
    .map((creative) => {
      const summary = coverageSummary({ creative: creativeShape(creative), assets: assetsOf.get(creative.id) ?? [], placements: openPlacements });
      return { id: creative.id, name: creative.name, missingLabels: summary.missingLabels, missingPlacements: summary.missingPlacements };
    });

  return attentionItems({
    rejected: creatives.filter((creative) => creative.status === "rejected").map((creative) => ({ id: creative.id, name: creative.name, note: creative.review_note })),
    gaps,
    limited: campaigns.filter((campaign) => campaign.status.key === "limited" || campaign.status.key === "stopped").map((campaign) => ({ id: campaign.id, name: campaign.name, key: campaign.status.key, note: campaign.status.note })),
    disputes,
    ending: campaigns.filter((campaign) => campaign.status.key === "live" || campaign.status.key === "limited").map((campaign) => ({ id: campaign.id, name: campaign.name, endsOn: campaign.ends })),
    today: new Date().toISOString().slice(0, 10),
  });
}

/** The period before, worked out from two totals rows: this period, and this one plus the one before it. */
function previousFigures(now, both) {
  const impressions = Math.max(0, Number(both.impressions) - Number(now.impressions));
  const weightedBoth = Number(both.avg_visible_seconds ?? 0) * Number(both.impressions);
  const weightedNow = Number(now.avg_visible_seconds ?? 0) * Number(now.impressions);
  return { impressions, avgVisible: impressions > 0 && both.avg_visible_seconds != null ? (weightedBoth - weightedNow) / impressions : null };
}

/**
 * What the chart marks for one campaign inside the period: when it went live, when the advertiser paused it,
 * and what developers paused or blocked (from the control rows). [{ date, kind: live|paused|blocked, label }]
 */
function campaignEvents({ campaign, mine, controls, userId, names, dates }) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const inside = (date) => date && date >= first && date <= last;
  const out = [];
  const starts = campaignSpan(mine).starts;
  if (mine.some((booking) => booking.status === "approved") && inside(starts)) out.push({ date: starts, kind: "live", label: `${campaign.name} live` });
  const pausedOn = campaign.paused_at ? String(campaign.paused_at).slice(0, 10) : "";
  if (inside(pausedOn)) out.push({ date: pausedOn, kind: "paused", label: `${campaign.name} paused by you` });
  const creativeIds = [...new Set(mine.map((booking) => booking.creativeId))];
  for (const entry of controlLog({ controlRows: controls, campaignId: campaign.id, advertiserId: userId, creativeIds, names })) {
    if (!inside(entry.at)) continue;
    const isPause = entry.state === "paused";
    out.push({ date: entry.at, kind: isPause ? "paused" : "blocked", label: entry.what ? `${entry.game}: ${entry.what} ${isPause ? "paused" : "blocked"}` : `${entry.game} ${isPause ? "paused" : "blocked"} it` });
  }
  return out;
}

/** Everything the advertiser Overview shows for the last `days` days. */
export async function loadOverview(service, me, days) {
  const { user } = me;
  const args = { p_advertiser: user.id, p_campaign: null };
  const [bookingResult, campaignRows, ownCreatives, totalsNow, totalsBoth, placementStats] = await Promise.all([
    loadBookings(service, (query) => query.eq("advertiser_id", user.id), { limit: 500 }),
    readCampaigns(service, user.id),
    readCreatives(service, user.id),
    service.rpc("advertiser_totals", { ...args, p_days: days }),
    service.rpc("advertiser_totals", { ...args, p_days: days * 2 }),
    service.rpc("advertiser_placement_stats", { ...args, p_days: days }),
  ]);
  const bookings = bookingResult.bookings;
  const { controls } = await attachControls(service, bookings);
  const [audienceOf, categoryOf] = await Promise.all([readAudiences(service, ownCreatives.map((creative) => creative.id)), readCategories(service, user.id)]);

  const totals = totalsNow.data?.[0] ?? ZERO;
  const previous = previousFigures(totals, totalsBoth.data?.[0] ?? ZERO);

  const perCampaign = figuresByCampaign(bookings, placementStats.data);

  // One daily series per campaign, over twice the period: the second half is the period, the first half the one before it.
  // The split by creative, game and format comes with migration 0027; without it the chart keeps Total and Campaign.
  const campaignList = campaignRows.rows;
  const [dailyOf, splitOf] = await Promise.all([
    Promise.all(campaignList.map((campaign) => service.rpc("advertiser_daily", { p_advertiser: user.id, p_campaign: campaign.id, p_days: days * 2 }))),
    Promise.all(campaignList.map((campaign) => service.rpc("advertiser_daily_split", { p_advertiser: user.id, p_campaign: campaign.id, p_days: days }))),
  ]);
  const splitMissing = splitOf.length > 0 && splitOf.every((result) => result.error);

  const dates = fillDays([], days).map((day) => day.date);
  const creativeNames = new Map(bookings.map((booking) => [booking.creativeId, booking.creativeName]));
  const places = new Map(bookings.map((booking) => [booking.placementId, { gameId: booking.gameId, game: booking.game, aspect: booking.placementAspect }]));
  const names = { games: new Map(bookings.map((booking) => [booking.gameId, booking.game])), creatives: creativeNames };

  const campaigns = campaignList.map((campaign, index) => {
    const mine = bookings.filter((booking) => booking.campaignId === campaign.id);
    const status = campaignStatus(mine, campaignFlags(campaign));
    const figures = perCampaign.get(campaign.id);
    const { starts, ends } = campaignSpan(mine);
    const audiences = [...new Set(mine.map((booking) => audienceOf.get(booking.creativeId)).filter(Boolean))];
    const daily2 = fillDays(dailyOf[index].data, days * 2);
    const gameIds = [...new Set(mine.filter((booking) => booking.status === "approved").map((booking) => booking.gameId).filter(Boolean))];
    const category = mine.map((booking) => categoryOf.get(booking.creativeId)).find(Boolean) ?? categoryOf.get(campaign.plan?.creativeId) ?? "";
    return {
      id: campaign.id,
      name: campaign.name,
      status,
      category,
      dates: dateRangeText(starts, ends) || (campaign.plan?.launched ? dateRangeText(campaign.plan.startsOn || null, campaign.plan.endsOn || null) : ""),
      audience: audienceLine(campaign, audiences[0]),
      games: gameIds.length,
      gameIds,
      reachedIds: figures ? [...figures.reached] : [],
      impressions: figures?.impressions ?? 0,
      avgVisible: figures && figures.weight > 0 ? figures.weighted / figures.weight : null,
      daily: daily2.slice(days).map((day) => Number(day.impressions) || 0),
      previousDaily: daily2.slice(0, days).map((day) => Number(day.impressions) || 0),
      split: splitOf[index].error ? null : buildSplits({ rows: splitOf[index].data ?? [], dates, creatives: creativeNames, places }),
      events: campaignEvents({ campaign, mine, controls, userId: user.id, names, dates }),
    };
  });

  return {
    days,
    dates,
    missing: [totalsNow, placementStats].some((result) => result.error),
    splitMissing,
    totals,
    reach: reachFigures(totals),
    previous,
    campaigns,
    hasCreatives: ownCreatives.length > 0,
    hasCampaigns: campaigns.length > 0,
  };
}

/** Impressions and weighted view time per campaign from placement stats; the newest booking names the campaign of a pair. */
function figuresByCampaign(bookings, stats) {
  const pairCampaign = new Map();
  const gameOf = new Map();
  for (const booking of bookings) {
    const key = `${booking.placementId}|${booking.creativeId}`;
    if (!pairCampaign.has(key)) pairCampaign.set(key, booking.campaignId);
    if (booking.gameId) gameOf.set(booking.placementId, booking.gameId);
  }
  const perCampaign = new Map();
  for (const item of stats ?? []) {
    const campaignId = pairCampaign.get(`${item.placement_id}|${item.creative_id}`);
    if (!campaignId) continue;
    const entry = perCampaign.get(campaignId) ?? { impressions: 0, weighted: 0, weight: 0, reached: new Set() };
    const count = Number(item.impressions) || 0;
    entry.impressions += count;
    if (count > 0 && gameOf.has(item.placement_id)) entry.reached.add(gameOf.get(item.placement_id));
    if (item.avg_visible_seconds != null) {
      entry.weighted += Number(item.avg_visible_seconds) * count;
      entry.weight += count;
    }
    perCampaign.set(campaignId, entry);
  }
  return perCampaign;
}

/** What the advertiser's creatives are about (ad_category, migration 0015); empty without the migration. */
async function readCategories(service, userId) {
  const { data, error } = await service.from("creatives").select("id, ad_category").eq("owner_id", userId);
  const map = new Map();
  if (error) return map;
  for (const row of data ?? []) if (row.ad_category) map.set(row.id, row.ad_category);
  return map;
}

/** One lean row per campaign for the Campaigns list: name, dates, status, audience, category and impressions over `days`. */
export async function loadCampaignList(service, me, days = 30) {
  const { user } = me;
  const [bookingResult, campaignRows, stats, creatives] = await Promise.all([
    loadBookings(service, (query) => query.eq("advertiser_id", user.id), { limit: 500 }),
    readCampaigns(service, user.id),
    service.rpc("advertiser_placement_stats", { p_advertiser: user.id, p_campaign: null, p_days: days }),
    readCreatives(service, user.id),
  ]);
  const bookings = bookingResult.bookings;
  await attachControls(service, bookings);
  const [audienceOf, categoryOf] = await Promise.all([
    readAudiences(service, creatives.map((creative) => creative.id)),
    readCategories(service, user.id),
  ]);
  const figures = figuresByCampaign(bookings, stats.data);

  const campaigns = campaignRows.rows.map((campaign) => {
    const mine = bookings.filter((booking) => booking.campaignId === campaign.id);
    const { starts, ends } = campaignSpan(mine);
    const audiences = [...new Set(mine.map((booking) => audienceOf.get(booking.creativeId)).filter(Boolean))];
    const category = mine.map((booking) => categoryOf.get(booking.creativeId)).find(Boolean) ?? categoryOf.get(campaign.plan?.creativeId) ?? "";
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaignStatus(mine, campaignFlags(campaign)),
      paused: Boolean(campaign.paused_at),
      pausedUntil: campaign.pausedUntil ?? null,
      // ISO days for the progress bar: the bookings' span, else the dates the campaign was started with
      starts: starts ?? (campaign.plan?.launched ? campaign.plan.startsOn || null : null),
      ends: ends ?? (campaign.plan?.launched ? campaign.plan.endsOn || null : null),
      dates: dateRangeText(starts, ends) || (campaign.plan?.launched ? dateRangeText(campaign.plan.startsOn || null, campaign.plan.endsOn || null) : ""),
      audience: audienceLine(campaign, audiences[0]),
      category,
      launched: Boolean(campaign.plan?.launched),
      bookings: mine.length,
      canPause: mine.some((booking) => booking.status === "approved" || booking.status === "pending"),
      closedBookings: mine.filter((booking) => booking.status !== "pending" && booking.status !== "approved").length,
      impressions: figures.get(campaign.id)?.impressions ?? 0,
    };
  });
  return { campaigns, creativeCount: creatives.length, error: bookingResult.error, missing: stats.error != null, rules: campaignRows.rules };
}

/**
 * The advertiser's creative library for the Creatives tab: each creative with its picture, status, the standard
 * formats it covers, how many open placements it cannot reach and how many campaigns use it.
 */
export async function loadCreativeLibrary(service, me) {
  const { user, role } = me;
  const [creativeRows, openPlacements, bookingResult, campaignRows, folderResult] = await Promise.all([
    readCreatives(service, user.id),
    readOpenPlacements(service, user.id, role),
    loadBookings(service, (query) => query.eq("advertiser_id", user.id), { limit: 500 }),
    service.from("campaigns").select("id, plan").eq("advertiser_id", user.id),
    // Folders come with migration 0028; without it the library is one flat list.
    service.from("creative_folders").select("id, name, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
  ]);
  const creatives = orderCreatives(creativeRows);
  const assetsOf = await readAssets(service, creatives.map((creative) => creative.id));
  const urls = new Map();
  const { data: paths } = creatives.length
    ? await service.from("creatives").select("id, storage_path").in("id", creatives.map((creative) => creative.id))
    : { data: [] };
  for (const row of paths ?? []) urls.set(row.id, service.storage.from("creatives").getPublicUrl(row.storage_path).data.publicUrl);

  const folders = folderResult.error ? [] : (folderResult.data ?? []).map((folder) => ({ id: folder.id, name: folder.name }));
  const known = new Set(folders.map((folder) => folder.id));
  const rows = creatives.map((creative) => {
    const assets = assetsOf.get(creative.id) ?? [];
    const shape = creativeShape(creative);
    const matrix = coverageByFormat({ creative: shape, assets });
    const summary = coverageSummary({ creative: shape, assets, placements: openPlacements });
    // A creative is in use by the campaigns that booked it and by the ones that only hold it in their plan (not booked yet).
    const campaigns = new Set(bookingResult.bookings.filter((booking) => booking.creativeId === creative.id).map((booking) => booking.campaignId));
    for (const row of campaignRows.data ?? []) if (planCreativeIds(row.plan).includes(creative.id)) campaigns.add(row.id);
    return {
      id: creative.id,
      name: creative.name,
      url: urls.get(creative.id) ?? "",
      status: creative.status,
      note: creative.review_note ?? "",
      folderId: creative.folder_id && known.has(creative.folder_id) ? creative.folder_id : null,
      formats: matrix.map((row) => ({ id: row.format.id, ready: row.kind !== "none" })),
      missingLabels: summary.missingLabels,
      missingPlacements: summary.missingPlacements,
      placements: summary.placements,
      campaigns: campaigns.size,
    };
  });
  return { creatives: rows, folders, folderTools: !folderResult.error, campaignCount: (campaignRows.data ?? []).length };
}

/**
 * Everything the creative editor shows for one of the advertiser's creatives: the picture, the extra pictures made
 * for single shapes, which shapes are covered (and how the automatic crop frames the rest), the advertiser's own
 * framing, how many open placements it cannot reach, the audience and the number of campaigns using it.
 * Null when the creative is not theirs. Columns from later migrations are optional.
 */
export async function loadCreativeEditor(service, me, creativeId) {
  const { user, role } = me;
  const id = String(creativeId ?? "");
  const read = (columns) => service.from("creatives").select(columns).eq("id", id).eq("owner_id", user.id).maybeSingle();
  const base = "id, name, storage_path, width_px, height_px, status, review_note";
  let { data: creative, error } = await read(`${base}, safe_x, safe_y, safe_w, safe_h, format_crops`);
  if (isSchemaOutdated(error)) ({ data: creative, error } = await read(`${base}, safe_x, safe_y, safe_w, safe_h`));
  const migrated = !isSchemaOutdated(error);
  if (!migrated) ({ data: creative } = await read(base));
  if (!creative) return null;

  const urlOf = (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;
  let assets = [];
  if (migrated) {
    const { data } = await service
      .from("creative_assets")
      .select("id, format_id, aspect, storage_path, width_px, height_px, status, review_note")
      .eq("creative_id", creative.id)
      .order("created_at", { ascending: true });
    assets = (data ?? []).map((row) => ({
      id: row.id,
      formatId: row.format_id,
      aspect: Number(row.aspect),
      url: urlOf(row.storage_path),
      width: row.width_px,
      height: row.height_px,
      status: row.status,
      note: row.review_note ?? "",
    }));
  }

  // Open placements: their shapes (coverage) and their games (audience catalog).
  let coverage = null;
  let openAspects = [];
  if (migrated && canAdvertise(role)) {
    let openQuery = service
      .from("placements")
      .select("game_id, aspect_ratio, games(genres, platforms, languages)")
      .eq("open_to_advertisers", true)
      .is("removed_at", null);
    if (role !== "admin") openQuery = openQuery.neq("owner_id", user.id); // an admin's own games count too
    const { data: open, error: openError } = await openQuery;
    if (!openError) {
      const shape = creativeShape(creative);
      const plain = assets.map((asset) => ({ formatId: asset.formatId, aspect: asset.aspect, status: asset.status }));
      coverage = coverageSummary({ creative: shape, assets: plain, placements: (open ?? []).map((row) => ({ aspect: row.aspect_ratio == null ? null : Number(row.aspect_ratio) })) });
      openAspects = (open ?? []).map((row) => Number(row.aspect_ratio)).filter((aspect) => aspect > 0);
    }
  }

  const shape = creativeShape(creative);
  const matrix = coverageByFormat({ creative: shape, assets: assets.map((asset) => ({ formatId: asset.formatId, aspect: asset.aspect, status: asset.status })) });
  const ready = Object.fromEntries(matrix.map((row) => [row.format.id, row.kind !== "none"]));
  // How the automatic crop frames the main picture for each shape it can cover: where the framing starts and what Reset returns to.
  const autoCrops = Object.fromEntries(matrix.filter((row) => row.kind === "crop").map((row) => [row.format.id, row.crop]));

  const { data: used } = await service.from("bookings").select("campaign_id").eq("creative_id", creative.id).eq("advertiser_id", user.id);
  const campaigns = new Set((used ?? []).map((row) => row.campaign_id)).size;

  return {
    creative: {
      id: creative.id,
      name: creative.name,
      url: urlOf(creative.storage_path),
      width: creative.width_px,
      height: creative.height_px,
      safe: { x: creative.safe_x, y: creative.safe_y, w: creative.safe_w, h: creative.safe_h },
    },
    assets,
    ready,
    autoCrops,
    formatCrops: creative.format_crops ?? {},
    status: creative.status,
    note: creative.review_note ?? "",
    placements: coverage?.placements ?? 0,
    missingPlacements: coverage?.missingPlacements ?? 0,
    openAspects,
    campaigns,
    migrated,
    formats: FORMATS.map((format) => format.id),
  };
}

/** The header of a campaign page (name, status, dates, audience, category) and the tab counts; null when it is not the advertiser's. */
export async function loadCampaignHead(service, me, campaignId) {
  const { user } = me;
  const found = await readCampaigns(service, user.id, { id: campaignId, order: false });
  const campaign = found.rows[0];
  if (!campaign) return null;
  const { bookings } = await loadBookings(service, (query) => query.eq("advertiser_id", user.id).eq("campaign_id", campaign.id), { limit: 500 });
  await attachControls(service, bookings);
  const creativeIds = [...new Set(bookings.map((booking) => booking.creativeId))];
  const audienceOf = await readAudiences(service, creativeIds);
  const { starts, ends } = campaignSpan(bookings);
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaignStatus(bookings, campaignFlags(campaign)),
    paused: Boolean(campaign.paused_at),
    pausedUntil: campaign.pausedUntil ?? null,
    rules: found.rules,
    targeting: campaign.targeting,
    plan: campaign.plan,
    dates: dateRangeText(starts, ends),
    starts: starts ?? (campaign.plan?.launched ? campaign.plan.startsOn || null : null),
    ends: ends ?? (campaign.plan?.launched ? campaign.plan.endsOn || null : null),
    audience: audienceLine(campaign, [...new Set(creativeIds.map((id) => audienceOf.get(id)).filter(Boolean))][0]),
    category: bookings.map((booking) => booking.category).find((category) => category && category !== "other") ?? "",
    creativeCount: new Set([...creativeIds, ...planCreativeIds(campaign.plan)]).size,
    bookings,
  };
}

/** The data of one campaign's report; null when the campaign is not the advertiser's. */
export async function loadCampaignReport(service, me, campaignId, days) {
  const { user } = me;
  const found = await readCampaigns(service, user.id, { id: campaignId, order: false });
  const campaign = found.rows[0];
  if (!campaign) return null;

  const { bookings: all } = await loadBookings(service, (query) => query.eq("advertiser_id", user.id).eq("campaign_id", campaign.id), { limit: 500 });
  const { controls } = await attachControls(service, all);
  const status = campaignStatus(all, campaignFlags(campaign));

  // Games this campaign skips (migration 0026).
  const skipped = await service.from("campaign_excluded_games").select("game_id").eq("campaign_id", campaign.id);
  const excludedGameIds = skipped.error ? [] : (skipped.data ?? []).map((row) => row.game_id);

  const args = { p_advertiser: user.id, p_campaign: campaign.id, p_days: days };
  const [totalsNow, totalsBoth, daily, placementStats] = all.length
    ? await Promise.all([
        service.rpc("advertiser_totals", args),
        service.rpc("advertiser_totals", { ...args, p_days: days * 2 }),
        service.rpc("advertiser_daily", args),
        service.rpc("advertiser_placement_stats", args),
      ])
    : [{ data: [ZERO] }, { data: [ZERO] }, { data: [] }, { data: [] }];

  const creativeIds = [...new Set(all.map((booking) => booking.creativeId))];
  const audienceOf = await readAudiences(service, creativeIds);
  // who saw the ads: platform, device, system, language, country (migration 0034)
  const players = all.length ? await loadAudience((dimension) => service.rpc("advertiser_audience", { ...args, p_dimension: dimension })) : { dimensions: {}, missing: true };
  // how well the ads were seen: chances, seen rate, view time, distance, angle (migration 0035)
  const attention = all.length ? await loadViewFigures(() => service.rpc("advertiser_attention", args)) : { row: null, missing: true };
  // touches on objects that carry the ad, where the developer marked them interactive (migration 0036)
  const interactions = all.length ? await loadAdvertiserInteractions(() => service.rpc("advertiser_interactions", args)) : { missing: true };
  // how many times each player saw the ad, and whether he looks less at it the next time (migration 0039)
  const frequency = all.length ? await loadFrequency(() => service.rpc("advertiser_frequency", args)) : { missing: true };
  const fatigue = all.length ? await loadFatigue(() => service.rpc("advertiser_fatigue", args)) : { missing: true };
  // when in the session the ad was seen (migration 0041); the scenes of a developer's game are not shown to advertisers
  const minutes = all.length ? await loadMinutes(() => service.rpc("advertiser_context", args)) : { missing: true };
  // each creative and each game side by side: engaged, viewable, touched, players (migration 0043)
  const compareResult = all.length ? await service.rpc("advertiser_compare", args) : { data: [], error: null };
  const compare = { missing: Boolean(compareResult.error), ...compareByKind(compareResult.error ? [] : compareResult.data) };
  const names = {
    games: new Map(all.map((booking) => [booking.gameId, booking.game])),
    creatives: new Map(all.map((booking) => [booking.creativeId, booking.creativeName])),
  };
  const starts = all.map((booking) => booking.startsOn).filter(Boolean).sort()[0] ?? null;
  const ends = all.map((booking) => booking.endsOn).filter(Boolean).sort().at(-1) ?? null;

  // "Racing · Quest" under each game (what the developer says it is, migration 0018).
  const gameIds = [...new Set(all.map((booking) => booking.gameId).filter(Boolean))];
  const profiles = gameIds.length ? await service.from("games").select("id, genres, platforms").in("id", gameIds) : { data: [] };
  const gameTags = {};
  if (!profiles.error) {
    for (const row of profiles.data ?? []) {
      const genres = (row.genres ?? []).slice(0, 2).map((id) => labelOf("genres", id));
      const platforms = (row.platforms ?? []).slice(0, 2).map((id) => labelOf("platforms", id));
      gameTags[row.id] = [genres.join(", "), platforms.join(", ")].filter(Boolean).join(" · ");
    }
  }
  const series = fillDays(daily.data, days);
  const totals = totalsNow.data?.[0] ?? ZERO;

  return {
    campaign,
    status,
    rules: found.rules,
    excludedGameIds,
    bookings: all,
    dates: dateRangeText(starts, ends),
    audience: audienceLine(campaign, [...new Set(creativeIds.map((id) => audienceOf.get(id)).filter(Boolean))][0]),
    creativeCount: creativeIds.length,
    totals,
    reach: reachFigures(totals),
    previous: previousFigures(totals, totalsBoth.data?.[0] ?? ZERO),
    series,
    placementStats: placementStats.data ?? [],
    players,
    attention,
    interactions,
    frequency,
    fatigue,
    minutes,
    creativeRows: creativeComparison(all, placementStats.data),
    compare,
    gameTags,
    events: campaignEvents({ campaign, mine: all, controls, userId: user.id, names, dates: series.map((day) => day.date) }),
    missing: [totalsNow, daily, placementStats].some((result) => result.error),
    log: controlLog({ controlRows: controls, campaignId: campaign.id, advertiserId: user.id, creativeIds, names }),
  };
}
