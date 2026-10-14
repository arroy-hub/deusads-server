// Reads what the Campaigns tab of a game shows (migration 0023): the campaigns that booked its placements,
// their creatives, the figures per creative and day, and what the developer has paused, blocked or opened.
// Rules (what counts as blocked, who may be shown) are in game-controls.js; this file only talks to Supabase.

import { isSchemaOutdated } from "./api.js";
import { formatLabel, formatOf } from "./formats.js";

import { STATS_DAYS } from "./campaigns-view.js";
import { effectivePause } from "./campaign-rules.js";

/** The campaigns' names and pauses. resume_on comes with migration 0028; without it only paused_at is read. */
async function readCampaigns(service, ids) {
  const full = await service.from("campaigns").select("id, name, paused_at, resume_on").in("id", ids);
  if (!full.error) return full;
  return service.from("campaigns").select("id, name, paused_at").in("id", ids);
}

export { STATS_DAYS };
const DAY = 86400000;

const who = (account) => account?.company || account?.email || "Unknown";
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The days of the figures, oldest first, ending today (UTC). */
export function statsDays(now = Date.now()) {
  const today = Date.parse(dayKey(now));
  return Array.from({ length: STATS_DAYS }, (_, index) => dayKey(today - (STATS_DAYS - 1 - index) * DAY));
}

/**
 * Where one booking stands on its own: "active" (approved and inside its dates), "waiting" (not started
 * yet, or waiting for an approved creative), "ended" (over, cancelled or rejected).
 */
export function bookingBase(booking, today) {
  if (booking.status === "pending") return "waiting";
  if (booking.status !== "approved") return "ended";
  if (booking.ends_on && booking.ends_on < today) return "ended";
  if (booking.starts_on && booking.starts_on > today) return "waiting";
  return "active";
}

/** A campaign (or creative) is active when any booking is, else waiting when any is, else ended. */
export function strongest(bases) {
  if (bases.includes("active")) return "active";
  if (bases.includes("waiting")) return "waiting";
  return "ended";
}

async function readBookings(service, placementIds) {
  const columns = "campaign_id, advertiser_id, creative_id, placement_id, status, created_at";
  const read = (list) => service.from("bookings").select(list).in("placement_id", placementIds).limit(5000);
  let result = await read(`${columns}, starts_on, ends_on`);
  if (isSchemaOutdated(result.error)) result = await read(columns);
  return result;
}

/**
 * The model of the Campaigns tab: { days, campaigns, advertisers, blocked, controls } or { error }.
 * `db` is the signed-in developer's client (the game is theirs, checked by the caller); `service` reads
 * other people's names and pictures, scoped here to the placements of this game.
 */
export async function loadCampaigns({ db, service, gameId, now = Date.now() }) {
  const today = dayKey(now);
  const days = statsDays(now);

  const { data: placements, error: placementsError } = await service.from("placements").select("id").eq("game_id", gameId);
  if (placementsError) return { error: "failed", detail: placementsError };
  const placementIds = (placements ?? []).map((row) => row.id);

  // Controls first: if the migration is missing nothing else is worth reading.
  const since = new Date(now - 3600000).toISOString();
  const [controls, categories, seen, recent] = await Promise.all([
    service.from("game_ad_controls").select("scope, target_id, state, reason, comment").eq("game_id", gameId),
    service.from("game_category_blocks").select("category, blocked").eq("game_id", gameId),
    service.from("game_ad_seen").select("kind, target_id").eq("game_id", gameId),
    service.from("game_ad_control_log").select("scope, target_id, batch_id, bulk_key, created_at").eq("game_id", gameId).gte("created_at", since),
  ]);
  const missing = [controls, categories, seen, recent].find((result) => result.error);
  if (missing) return { error: isSchemaOutdated(missing.error) || missing.error.code === "42P01" ? "migration" : "failed", detail: missing.error };

  const base = {
    days,
    campaigns: [],
    advertisers: [],
    controls: controls.data ?? [],
    categoryRows: categories.data ?? [],
    recent: recent.data ?? [],
  };
  if (!placementIds.length) return base;

  const { data: bookings, error: bookingsError } = await readBookings(service, placementIds);
  if (bookingsError) return { error: "failed", detail: bookingsError };
  if (!bookings?.length) return base;

  const unique = (key) => [...new Set(bookings.map((row) => row[key]))];
  const [campaigns, creatives, accounts, stats] = await Promise.all([
    readCampaigns(service, unique("campaign_id")),
    service.from("creatives").select("id, name, storage_path, width_px, height_px, ad_category").in("id", unique("creative_id")),
    service.from("accounts").select("id, email, company").in("id", unique("advertiser_id")),
    db.rpc("game_campaign_stats", { p_game_id: gameId, p_from: days[0], p_to: days.at(-1) }),
  ]);
  if (campaigns.error || creatives.error || accounts.error) return { error: "failed", detail: campaigns.error ?? creatives.error ?? accounts.error };

  const nameOf = new Map((campaigns.data ?? []).map((row) => [row.id, row.name]));
  const pausedOf = new Map((campaigns.data ?? []).map((row) => [row.id, Boolean(effectivePause(row.paused_at ?? null, row.resume_on ?? null))]));
  const creativeOf = new Map((creatives.data ?? []).map((row) => [row.id, row]));
  const accountOf = new Map((accounts.data ?? []).map((row) => [row.id, row]));
  const seenOf = new Set((seen.data ?? []).map((row) => `${row.kind}:${row.target_id}`));

  // Figures per creative: views, visible seconds and the count they average over, one number per day.
  const index = new Map(days.map((day, position) => [day, position]));
  const figures = new Map();
  for (const row of stats.error ? [] : stats.data ?? []) {
    const position = index.get(String(row.day).slice(0, 10));
    if (position === undefined) continue;
    if (!figures.has(row.creative_id)) {
      figures.set(row.creative_id, { v: new Array(STATS_DAYS).fill(0), s: new Array(STATS_DAYS).fill(0), n: new Array(STATS_DAYS).fill(0) });
    }
    const entry = figures.get(row.creative_id);
    entry.v[position] = Number(row.views) || 0;
    entry.s[position] = Number(row.visible_sum) || 0;
    entry.n[position] = Number(row.visible_n) || 0;
  }

  const byCampaign = new Map();
  for (const booking of bookings) {
    if (!byCampaign.has(booking.campaign_id)) byCampaign.set(booking.campaign_id, []);
    byCampaign.get(booking.campaign_id).push(booking);
  }

  const items = [];
  for (const [campaignId, rows] of byCampaign) {
    const byCreative = new Map();
    for (const booking of rows) {
      if (!byCreative.has(booking.creative_id)) byCreative.set(booking.creative_id, []);
      byCreative.get(booking.creative_id).push(booking);
    }
    const creativeItems = [...byCreative].map(([creativeId, own]) => {
      const creative = creativeOf.get(creativeId);
      const aspect = creative?.width_px && creative?.height_px ? creative.width_px / creative.height_px : 0;
      const format = formatOf(aspect);
      return {
        id: creativeId,
        name: creative?.name ?? "Creative",
        aspect: aspect || 1,
        format: format ? formatLabel(format).split(" ")[0] : aspect ? "Custom" : "",
        url: creative?.storage_path ? service.storage.from("creatives").getPublicUrl(creative.storage_path).data.publicUrl : "",
        category: creative?.ad_category ?? "other",
        base: strongest(own.map((booking) => bookingBase(booking, today))),
        isNew: !seenOf.has(`creative:${creativeId}`),
        figures: figures.get(creativeId) ?? null,
      };
    });
    const started = rows.map((booking) => booking.starts_on || String(booking.created_at).slice(0, 10)).sort()[0];
    const first = rows[0];
    items.push({
      id: campaignId,
      name: nameOf.get(campaignId) ?? "Campaign",
      advertiserId: first.advertiser_id,
      advertiser: who(accountOf.get(first.advertiser_id)),
      category: creativeItems[0]?.category ?? "other",
      base: strongest(rows.map((booking) => bookingBase(booking, today))),
      advertiserPaused: pausedOf.get(campaignId) === true,
      started,
      isNew: !seenOf.has(`campaign:${campaignId}`),
      creatives: creativeItems,
    });
  }

  return { ...base, campaigns: items };
}

/** How many campaigns (or creatives in them) the developer has not opened yet: for the tab badge. */
export async function countNew({ service, gameId }) {
  const { data: placements } = await service.from("placements").select("id").eq("game_id", gameId);
  const ids = (placements ?? []).map((row) => row.id);
  if (!ids.length) return 0;
  const [bookings, seen] = await Promise.all([
    service.from("bookings").select("campaign_id, creative_id").in("placement_id", ids).limit(5000),
    service.from("game_ad_seen").select("kind, target_id").eq("game_id", gameId),
  ]);
  if (bookings.error || seen.error) return 0;
  const seenSet = new Set((seen.data ?? []).map((row) => `${row.kind}:${row.target_id}`));
  const fresh = new Set();
  for (const row of bookings.data ?? []) {
    if (!seenSet.has(`campaign:${row.campaign_id}`) || !seenSet.has(`creative:${row.creative_id}`)) fresh.add(row.campaign_id);
  }
  return fresh.size;
}
