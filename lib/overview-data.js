// Reads what the My games page adds to each game (migrations 0023 and 0024): the SDK connection, what is new,
// and the "since your last visit" summary. Rules are in connection.js, visits.js and digest.js.

import { connection } from "./connection.js";
import { buildDigest } from "./digest.js";
import { digestWanted, nextVisit } from "./visits.js";

/**
 * Registers a page view as part of a visit and returns { visit_at, since_at, digest_dismissed_at } or null before
 * migration 0024. Writes only when something changed, so a page view usually costs one read.
 */
export async function registerVisit(service, userId, now = Date.now()) {
  if (!userId) return null;
  const { data: row, error } = await service
    .from("accounts")
    .select("visit_at, visit_active_at, since_at, digest_dismissed_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !row) return null;
  const next = nextVisit(row, now);
  if (next.changed) {
    const { error: writeError } = await service
      .from("accounts")
      .update({ visit_at: next.visit_at, visit_active_at: next.visit_active_at, since_at: next.since_at })
      .eq("id", userId);
    if (writeError) return null;
  }
  return { visit_at: next.visit_at, since_at: next.since_at, digest_dismissed_at: row.digest_dismissed_at };
}

/** Per game: the campaigns and creatives the developer has not opened yet (same rule as the Campaigns tab). */
export async function newByGame(service, gameIds) {
  const result = new Map(gameIds.map((id) => [id, { campaigns: 0, creatives: 0 }]));
  if (!gameIds.length) return result;
  const { data: placements } = await service.from("placements").select("id, game_id").in("game_id", gameIds);
  const gameOf = new Map((placements ?? []).map((row) => [row.id, row.game_id]));
  if (!gameOf.size) return result;
  const [bookings, seen] = await Promise.all([
    service.from("bookings").select("campaign_id, creative_id, placement_id").in("placement_id", [...gameOf.keys()]).limit(5000),
    service.from("game_ad_seen").select("game_id, kind, target_id").in("game_id", gameIds),
  ]);
  if (bookings.error || seen.error) return result;
  const seenSet = new Set((seen.data ?? []).map((row) => `${row.game_id}:${row.kind}:${row.target_id}`));
  const campaigns = new Map(); // game -> campaigns not opened
  const creatives = new Map(); // game -> creatives not opened, in campaigns that were opened
  for (const row of bookings.data ?? []) {
    const game = gameOf.get(row.placement_id);
    if (!game) continue;
    const campaignNew = !seenSet.has(`${game}:campaign:${row.campaign_id}`);
    const creativeNew = !seenSet.has(`${game}:creative:${row.creative_id}`);
    if (campaignNew) (campaigns.get(game) ?? campaigns.set(game, new Set()).get(game)).add(row.campaign_id);
    else if (creativeNew) (creatives.get(game) ?? creatives.set(game, new Set()).get(game)).add(row.creative_id);
  }
  for (const id of gameIds) result.set(id, { campaigns: campaigns.get(id)?.size ?? 0, creatives: creatives.get(id)?.size ?? 0 });
  return result;
}

/** The lines of "Since your last visit", or [] when there is nothing to say or it is not wanted. */
export async function loadDigest({ service, userId, games, visit, now = Date.now() }) {
  if (!visit || !digestWanted(visit) || !games.length) return [];
  const gameIds = games.map((game) => game.id);
  const [placements, disputes] = await Promise.all([
    service.from("placements").select("id, game_id, first_seen_at").in("game_id", gameIds).is("removed_at", null),
    service.from("creative_disputes").select("creative_id, outcome, resolved_at").eq("developer_id", userId).eq("status", "resolved").gt("resolved_at", visit.since_at),
  ]);
  const gameOf = new Map((placements.data ?? []).map((row) => [row.id, row.game_id]));
  const bookings = gameOf.size
    ? await service.from("bookings").select("campaign_id, creative_id, placement_id, created_at").in("placement_id", [...gameOf.keys()]).limit(5000)
    : { data: [] };
  const rows = disputes.error ? [] : disputes.data ?? [];
  const names = rows.length ? await service.from("creatives").select("id, name").in("id", rows.map((row) => row.creative_id)) : { data: [] };
  const nameOf = new Map((names.data ?? []).map((row) => [row.id, row.name]));

  return buildDigest({
    games: games.map((game) => ({ id: game.id, name: game.name, ...game.connection })),
    bookings: (bookings.data ?? []).map((row) => ({ game_id: gameOf.get(row.placement_id), campaign_id: row.campaign_id, creative_id: row.creative_id, created_at: row.created_at })),
    placements: placements.data ?? [],
    disputes: rows.map((row) => ({ creative: nameOf.get(row.creative_id) ?? "creative", outcome: row.outcome, resolved_at: row.resolved_at })),
    since: visit.since_at,
  });
}

export { connection };
