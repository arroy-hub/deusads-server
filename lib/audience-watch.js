// Keeps track of which campaign fits which game, and since when (migration 0058, table campaign_fit), so that
//   - a campaign that stopped fitting a game stays in the developer's Campaigns list for an hour and then drops out, and
//   - both people are told, on Home (Recent activity) and under the bell, when it stops fitting and when it fits again.
// What fits is decided by lib/audience-fit.js, the manifest's own rule. This file only remembers the moment it changed.
// The rules are pure (fitChanges, fitNotices, isLapsed); reconcileFit reads and writes.

import { fitOf, loadFitInputs } from "./audience-fit.js";
import { gameCampaignsLink, notify } from "./notify.js";

/** How long a campaign that no longer fits stays in the list. */
export const KEEP_MS = 60 * 60 * 1000;

const outdated = (error) => Boolean(error) && ["42703", "PGRST204", "PGRST100"].includes(error.code);
const pairKey = (gameId, campaignId) => `${gameId}:${campaignId}`;

/** A row of campaign_fit that has said 'does not fit' for the whole hour: the campaign leaves the list. */
export function isLapsed(row, now = Date.now()) {
  if (!row || row.fits !== false) return false;
  const since = Date.parse(row.since);
  return Number.isFinite(since) && now - since >= KEEP_MS;
}

/** What one campaign is in one game, from the audience problem of each of its creatives: it fits while any creative may be shown. */
export function pairFit(problems) {
  if (problems.length === 0 || problems.some((problem) => !problem)) return { fits: true, why: "" };
  const first = problems.find((problem) => problem.scope === "campaign") ?? problems[0];
  return { fits: false, why: first.why };
}

/**
 * What changed since the last look.
 *   current  [{ gameId, campaignId, fits, why }]   stored  [{ game_id, campaign_id, fits, since }] (campaign_fit rows)
 * start: seen for the first time (remembered, nobody is told); lost: fitted, does not now; back: did not, does now;
 * stale: remembered but no longer booked there.
 */
export function fitChanges(current, stored) {
  const known = new Map(stored.map((row) => [pairKey(row.game_id, row.campaign_id), row]));
  const seen = new Set();
  const result = { start: [], lost: [], back: [], stale: [] };
  for (const item of current) {
    const key = pairKey(item.gameId, item.campaignId);
    seen.add(key);
    const row = known.get(key);
    if (!row) result.start.push(item);
    else if (row.fits && !item.fits) result.lost.push(item);
    else if (!row.fits && item.fits) result.back.push(item);
  }
  for (const row of stored) if (!seen.has(pairKey(row.game_id, row.campaign_id))) result.stale.push(row);
  return result;
}

const group = (list, keyOf) => {
  const map = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
};

/**
 * The messages for a set of changes, one per person and game and direction.
 *   names  { games: Map(id -> { name, ownerId }), campaigns: Map(id -> { name }) }
 * Returns [{ accountId, text, link, type }].
 */
export function fitNotices({ lost = [], back = [] }, names) {
  const notices = [];
  for (const [direction, list] of [["lost", lost], ["back", back]]) {
    const gone = direction === "lost";
    for (const [gameId, items] of group(list, (item) => item.gameId)) {
      const game = names.games.get(gameId);
      if (!game) continue;
      const one = items.length === 1 ? items[0] : null;
      const campaign = one ? names.campaigns.get(one.campaignId)?.name ?? "A campaign" : "";
      // The developer: the game changed or an audience did; the campaign is in their Campaigns tab.
      if (game.ownerId) {
        notices.push({
          accountId: game.ownerId,
          text: one
            ? gone ? `"${campaign}" stopped showing in ${game.name}: the game no longer fits its audience (${one.why}).` : `"${campaign}" is showing again in ${game.name}: the game fits its audience again.`
            : gone ? `${items.length} campaigns stopped showing in ${game.name}: the game no longer fits their audience.` : `${items.length} campaigns are showing again in ${game.name}: the game fits their audience again.`,
          link: gameCampaignsLink(gameId, one?.campaignId ?? null),
          type: "dev_audience_fit",
        });
      }
    }
    // The advertiser: their ad stopped, or started again, in a game.
    for (const [key, items] of group(list, (item) => `${item.advertiserId}|${item.gameId}`)) {
      const [advertiserId, gameId] = key.split("|");
      const game = names.games.get(gameId);
      if (!game || !advertiserId || advertiserId === "undefined" || advertiserId === "null") continue;
      const one = items.length === 1 ? items[0] : null;
      const campaign = one ? names.campaigns.get(one.campaignId)?.name ?? "A campaign" : "";
      notices.push({
        accountId: advertiserId,
        text: one
          ? gone ? `"${campaign}" stopped showing in ${game.name}: the game no longer fits the audience (${one.why}).` : `"${campaign}" is showing again in ${game.name}: the game fits the audience again.`
          : gone ? `${items.length} of your campaigns stopped showing in ${game.name}: the game no longer fits their audience.` : `${items.length} of your campaigns are showing again in ${game.name}: the game fits their audience again.`,
        link: one ? `/dashboard/advertising/c/${one.campaignId}` : "/dashboard/advertising",
        type: "adv_audience_fit",
      });
    }
  }
  return notices;
}

/** The open bookings in a scope (a game's placements and/or one campaign). null when they cannot be read. */
async function openBookings(service, { ids, campaignId }) {
  if (ids && ids.length === 0) return [];
  const read = (columns) => {
    let query = service.from("bookings").select(columns).in("status", ["approved", "pending"]).limit(5000);
    if (ids) query = query.in("placement_id", ids);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    return query;
  };
  const columns = "campaign_id, creative_id, placement_id, advertiser_id";
  let result = await read(`${columns}, ends_on`);
  if (outdated(result.error)) result = await read(columns);
  return result.error ? null : result.data ?? [];
}

/**
 * Looks at what fits now against what was remembered, remembers it, and tells the people involved about every change.
 * Scope: one game, one campaign, or (neither) everything. Safe to run at any time and as often as wanted; each change is
 * claimed once, so two runs at the same moment do not tell anybody twice. Never throws for a missing table or column:
 * it returns { skipped } and the dashboards go on showing what they work out on every read.
 */
export async function reconcileFit(service, { gameId = null, campaignId = null, now = Date.now() } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  let ids = null;
  if (gameId) {
    const found = await service.from("placements").select("id").eq("game_id", gameId);
    if (found.error) return { skipped: "placements" };
    ids = (found.data ?? []).map((row) => row.id);
  }
  const bookings = await openBookings(service, { ids, campaignId });
  if (!bookings) return { skipped: "bookings" };
  const live = bookings.filter((booking) => !(booking.ends_on && String(booking.ends_on).slice(0, 10) < today));

  const placementIds = [...new Set(live.map((booking) => booking.placement_id))];
  const placements = placementIds.length ? await service.from("placements").select("id, game_id").in("id", placementIds) : { data: [], error: null };
  if (placements.error) return { skipped: "placements" };
  const gameOf = new Map((placements.data ?? []).map((row) => [row.id, row.game_id]));

  const pairs = new Map();
  for (const booking of live) {
    const game = gameOf.get(booking.placement_id);
    if (!game) continue;
    const key = pairKey(game, booking.campaign_id);
    if (!pairs.has(key)) pairs.set(key, { gameId: game, campaignId: booking.campaign_id, advertiserId: booking.advertiser_id ?? null, creativeIds: new Set() });
    pairs.get(key).creativeIds.add(booking.creative_id);
  }

  const inputs = await loadFitInputs(service, {
    campaignIds: [...pairs.values()].map((pair) => pair.campaignId),
    creativeIds: live.map((booking) => booking.creative_id),
    gameIds: [...pairs.values()].map((pair) => pair.gameId),
  });
  if (!inputs) return { skipped: "inputs" };

  const current = [...pairs.values()].map((pair) => ({
    gameId: pair.gameId,
    campaignId: pair.campaignId,
    advertiserId: pair.advertiserId,
    ...pairFit([...pair.creativeIds].map((creativeId) => fitOf(inputs, { campaignId: pair.campaignId, creativeId, gameId: pair.gameId }))),
  }));

  let readStored = service.from("campaign_fit").select("game_id, campaign_id, fits, since");
  if (gameId) readStored = readStored.eq("game_id", gameId);
  if (campaignId) readStored = readStored.eq("campaign_id", campaignId);
  const stored = await readStored;
  if (stored.error) return { skipped: "table" };

  const changes = fitChanges(current, stored.data ?? []);
  const stamp = new Date(now).toISOString();
  const table = () => service.from("campaign_fit");

  if (changes.start.length) {
    await table().upsert(changes.start.map((item) => ({ game_id: item.gameId, campaign_id: item.campaignId, fits: item.fits, why: item.fits ? null : item.why, since: stamp })), { onConflict: "game_id,campaign_id", ignoreDuplicates: true });
  }
  for (const row of changes.stale) await table().delete().eq("game_id", row.game_id).eq("campaign_id", row.campaign_id);

  // A change is claimed by the run that flips the row, so it is announced once.
  const claimed = { lost: [], back: [] };
  for (const [direction, list] of [["lost", changes.lost], ["back", changes.back]]) {
    for (const item of list) {
      const done = await table()
        .update({ fits: item.fits, why: item.fits ? null : item.why, since: stamp })
        .eq("game_id", item.gameId)
        .eq("campaign_id", item.campaignId)
        .eq("fits", !item.fits)
        .select("campaign_id");
      if (!done.error && (done.data ?? []).length > 0) claimed[direction].push(item);
    }
  }

  const told = claimed.lost.length + claimed.back.length;
  if (told > 0) {
    const everyone = [...claimed.lost, ...claimed.back];
    const [games, campaigns] = await Promise.all([
      service.from("games").select("id, name, owner_id").in("id", [...new Set(everyone.map((item) => item.gameId))]),
      service.from("campaigns").select("id, name").in("id", [...new Set(everyone.map((item) => item.campaignId))]),
    ]);
    const names = {
      games: new Map((games.data ?? []).map((row) => [row.id, { name: row.name, ownerId: row.owner_id }])),
      campaigns: new Map((campaigns.data ?? []).map((row) => [row.id, { name: row.name }])),
    };
    await Promise.allSettled(fitNotices(claimed, names).map((notice) => notify(service, notice)));
  }
  return { started: changes.start.length, lost: claimed.lost.length, back: claimed.back.length };
}
