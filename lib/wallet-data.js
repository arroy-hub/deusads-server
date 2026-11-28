// Reads the wallet (migration 0061) for the pages that show it. The rules are in wallet.js; this file only talks to
// Supabase, always with the service client and always scoped to the account it is given.
// Every loader answers { missing: true } when the migration is not applied, so a page can say what to run.

import { campaignCoverCss } from "./campaign-cover.js";
import { budgetOf, lastDays, walletMissing } from "./wallet.js";
import { loadLanding } from "./picture-landing.js";

/** The approved bookings that show a picture (a creative with no picture for a placement's shape shows nothing there). */
async function showing(service, bookings) {
  const rows = bookings ?? [];
  const lands = await loadLanding(service, rows).catch(() => () => true);
  return rows.filter((row) => lands(row.creative_id, row.placement_id));
}

const number = (value) => Number(value ?? 0) || 0;
const who = (account) => account?.company || account?.email || "Unknown";
const urlOf = (service) => (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;
const logged = (label, error) => {
  if (error && !walletMissing(error)) console.error(`[DeusADS] wallet ${label}:`, error.code, error.message);
};

/** What is in an advertiser's wallet, or null when the wallet is not there yet (migration 0061 not applied). */
export async function loadAvailable(service, userId) {
  const { data, error } = await service.rpc("wallet_available", { p_account: userId });
  if (error) {
    logged("available", error);
    return null;
  }
  return number(data);
}

/**
 * Campaigns that have ended get what is left of their budget back into the wallet (wallet_close does it once).
 * `campaigns` are rows with { id, status: { key }, budget } (budget as budgetOf gives it); the ones that were settled
 * are updated in place. Never throws.
 */
export async function settleEnded(service, userId, campaigns) {
  for (const campaign of campaigns ?? []) {
    const state = campaign.budget;
    if (campaign.status?.key !== "ended" || !state || state.unlimited || state.closed) continue;
    try {
      const { data, error } = await service.rpc("wallet_close", { p_account: userId, p_campaign: campaign.id });
      if (error || !data?.ok) {
        logged("close", error);
        continue;
      }
      campaign.budget = { ...state, closed: true, out: false, left: 0, returned: number(data.returned) };
    } catch (error) {
      console.error("[DeusADS] wallet close failed:", error?.message ?? error);
    }
  }
}

const OP_COLUMNS = "id, kind, campaign_id, campaign_name, amount, created_at";

/**
 * The advertiser's wallet. `campaigns` are the rows of loadCampaignList (they carry `budget` and `status`).
 * Returns { missing } or:
 *   available, reserved      credits free to use, and still held in campaign budgets
 *   spent, impressions       what the campaigns were charged in all, and for how many impressions
 *   spentToday, impressionsToday
 *   ops                      the wallet's operations, newest first: [{ id, kind, campaignId, campaignName, amount, at }]
 *   spend                    daily spending of the last `spendDays` days: [{ day, campaignId, impressions, amount }]
 */
export async function loadAdvertiserWallet(service, userId, campaigns, { spendDays = 90, now = Date.now() } = {}) {
  const days = lastDays(spendDays, now);
  const [summary, ops, spend] = await Promise.all([
    service.rpc("wallet_advertiser", { p_account: userId }),
    service.from("wallet_ops").select(OP_COLUMNS).eq("account_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500),
    service.rpc("wallet_spend_daily", { p_account: userId, p_from: days[0], p_to: days.at(-1), p_campaign: null }),
  ]);
  const failed = summary.error ?? ops.error ?? spend.error;
  if (failed) {
    logged("advertiser", failed);
    return { missing: walletMissing(failed), failed: !walletMissing(failed) };
  }
  const reserved = (campaigns ?? []).reduce((sum, campaign) => sum + (campaign.budget && !campaign.budget.unlimited ? campaign.budget.left : 0), 0);
  return {
    available: number(summary.data?.available),
    reserved,
    spent: number(summary.data?.spent),
    impressions: number(summary.data?.impressions),
    spentToday: number(summary.data?.spent_today),
    impressionsToday: number(summary.data?.impressions_today),
    ops: (ops.data ?? []).map((row) => ({ id: row.id, kind: row.kind, campaignId: row.campaign_id ?? null, campaignName: row.campaign_name ?? "", amount: number(row.amount), at: row.created_at })),
    spend: (spend.data ?? []).map((row) => ({ day: String(row.day).slice(0, 10), campaignId: row.campaign_id, impressions: number(row.impressions), amount: number(row.amount) })),
  };
}

/** What one campaign spent on each of the last `days` days: [{ day, impressions, amount }], or null when the wallet is missing. */
export async function loadCampaignSpend(service, userId, campaignId, { days = 30, now = Date.now() } = {}) {
  const list = lastDays(days, now);
  const { data, error } = await service.rpc("wallet_spend_daily", { p_account: userId, p_from: list[0], p_to: list.at(-1), p_campaign: campaignId });
  if (error) {
    logged("campaign spend", error);
    return null;
  }
  const byDay = new Map((data ?? []).map((row) => [String(row.day).slice(0, 10), row]));
  return list.map((day) => ({ day, impressions: number(byDay.get(day)?.impressions), amount: number(byDay.get(day)?.amount) }));
}

/** Names, advertisers, covers and budgets of campaigns, for people who are not their advertiser: Map id -> row. */
async function campaignCards(service, campaignIds, advertiserOf = new Map()) {
  const ids = [...new Set(campaignIds)].filter(Boolean);
  const cards = new Map();
  if (!ids.length) return cards;
  const [rows, covers] = await Promise.all([
    service.from("campaigns").select("id, name, advertiser_id, paused_at, plan, budget, budget_spent, budget_closed_at, budget_returned").in("id", ids),
    service.from("campaigns").select("id, cover").in("id", ids),
  ]);
  const coverOf = new Map(covers.error ? [] : (covers.data ?? []).map((row) => [row.id, row.cover ?? null]));
  const found = new Map((rows.data ?? []).map((row) => [row.id, row]));
  const accountIds = [...new Set([...(rows.data ?? []).map((row) => row.advertiser_id), ...advertiserOf.values()])].filter(Boolean);
  const accounts = accountIds.length ? await service.from("accounts").select("id, email, company").in("id", accountIds) : { data: [] };
  const accountOf = new Map((accounts.data ?? []).map((row) => [row.id, row]));
  for (const id of ids) {
    const row = found.get(id);
    const advertiserId = row?.advertiser_id ?? advertiserOf.get(id) ?? null;
    cards.set(id, {
      id,
      name: row?.name ?? "Deleted campaign",
      deleted: !row,
      advertiserId,
      advertiser: who(accountOf.get(advertiserId)),
      coverCss: campaignCoverCss({ id, value: coverOf.get(id) ?? null, urlOf: urlOf(service) }),
      budget: budgetOf(row ?? null),
      paused: Boolean(row?.paused_at),
      stopped: Boolean(row?.plan?.stoppedAt),
    });
  }
  return cards;
}

/** How a campaign stands for somebody who is not its advertiser: { key, label }. `live`: it has a running booking. */
export function outsideStatus(card, live) {
  if (card.deleted) return { key: "ended", label: "Deleted" };
  if (card.stopped || card.budget.closed) return { key: "ended", label: "Ended" };
  if (!live) return { key: "ended", label: "Ended" };
  if (card.budget.out) return { key: "budget", label: "Out of budget" };
  if (card.paused) return { key: "paused", label: "Paused" };
  return { key: "live", label: "Active" };
}

/**
 * A developer's earnings. Returns { missing } or:
 *   total, today     { impressions, amount } all time and today (amounts are what advertisers paid)
 *   days             the last 90 UTC days, oldest first
 *   games            [{ id, name, iconUrl }] the developer's games, in the order they were added
 *   daily            Map gameId -> impressions per day (aligned with `days`)
 *   campaigns        { 7: [...], 30: [...], 90: [...] } each [{ id, name, advertiser, coverCss, status, impressions, games: Set }]
 *                    most paid first; `games`: the games it was paid in during that period
 */
export async function loadDeveloperWallet(service, userId, { now = Date.now() } = {}) {
  const days = lastDays(90, now);
  const window = (length) => ({ p_account: userId, p_from: days[days.length - length], p_to: days.at(-1) });
  const [d90, d30, d7, games] = await Promise.all([
    service.rpc("wallet_developer", window(90)),
    service.rpc("wallet_developer", window(30)),
    service.rpc("wallet_developer", window(7)),
    service.from("games").select("id, name, icon_path, created_at").eq("owner_id", userId).order("created_at", { ascending: true }),
  ]);
  const failed = d90.error ?? d30.error ?? d7.error;
  if (failed) {
    logged("developer", failed);
    return { missing: walletMissing(failed), failed: !walletMissing(failed) };
  }
  const index = new Map(days.map((day, position) => [day, position]));
  const daily = new Map();
  for (const row of d90.data?.daily ?? []) {
    const position = index.get(String(row.day).slice(0, 10));
    if (position === undefined) continue;
    if (!daily.has(row.game_id)) daily.set(row.game_id, new Array(days.length).fill(0));
    daily.get(row.game_id)[position] += number(row.impressions);
  }
  // A game that was deleted keeps its earnings: it is listed after the games that exist.
  const known = (games.data ?? []).map((game) => ({ id: game.id, name: game.name, iconUrl: game.icon_path ? urlOf(service)(game.icon_path) : "" }));
  const gone = [...daily.keys()].filter((id) => !known.some((game) => game.id === id)).map((id) => ({ id, name: "Deleted game", iconUrl: "", deleted: true }));

  const rowsOf = { 7: d7.data?.campaigns ?? [], 30: d30.data?.campaigns ?? [], 90: d90.data?.campaigns ?? [] };
  const advertiserOf = new Map(rowsOf[90].map((row) => [row.campaign_id, row.advertiser_id]));
  const campaignIds = rowsOf[90].map((row) => row.campaign_id);
  const [cards, live] = await Promise.all([
    campaignCards(service, campaignIds, advertiserOf),
    campaignIds.length ? service.from("bookings").select("campaign_id, creative_id, placement_id").eq("developer_id", userId).eq("status", "approved").in("campaign_id", [...new Set(campaignIds)]).limit(5000) : { data: [] },
  ]);
  const liveSet = new Set((await showing(service, live.data)).map((row) => row.campaign_id));
  const campaigns = {};
  for (const [length, rows] of Object.entries(rowsOf)) {
    const byId = new Map();
    for (const row of rows) {
      const entry = byId.get(row.campaign_id) ?? { impressions: 0, games: new Set() };
      entry.impressions += number(row.impressions);
      entry.games.add(row.game_id);
      byId.set(row.campaign_id, entry);
    }
    campaigns[length] = [...byId]
      .map(([id, entry]) => {
        const card = cards.get(id) ?? { id, name: "Deleted campaign", advertiser: "Unknown", coverCss: "", deleted: true, budget: budgetOf(null) };
        return { id, name: card.name, advertiser: card.advertiser, coverCss: card.coverCss, status: outsideStatus(card, liveSet.has(id)), impressions: entry.impressions, games: [...entry.games] };
      })
      .sort((a, b) => b.impressions - a.impressions);
  }
  const sum = (part) => ({ impressions: number(part?.impressions), amount: number(part?.amount) });
  return { total: sum(d90.data?.total), today: sum(d90.data?.today), days, games: [...known, ...gone], daily: Object.fromEntries(daily), campaigns };
}

/** The short figures of a developer's wallet for Home: { missing } or { total, today, days (7), week: impressions per day, paying }. */
export async function loadDeveloperGlance(service, userId, { now = Date.now() } = {}) {
  const days = lastDays(7, now);
  const [{ data, error }, live] = await Promise.all([
    service.rpc("wallet_developer", { p_account: userId, p_from: days[0], p_to: days.at(-1) }),
    service.from("bookings").select("campaign_id, creative_id, placement_id").eq("developer_id", userId).eq("status", "approved").limit(5000),
  ]);
  if (error) {
    logged("developer glance", error);
    return { missing: true };
  }
  const week = days.map((day) => (data?.daily ?? []).filter((row) => String(row.day).slice(0, 10) === day).reduce((sum, row) => sum + number(row.impressions), 0));
  const liveIds = [...new Set((await showing(service, live.data)).map((row) => row.campaign_id))];
  // "paying": campaigns that are showing in the developer's games and still have budget
  let paying = 0;
  if (liveIds.length) {
    const cards = await campaignCards(service, liveIds);
    paying = liveIds.filter((id) => outsideStatus(cards.get(id), true).key === "live").length;
  }
  return { total: { impressions: number(data?.total?.impressions), amount: number(data?.total?.amount) }, today: { impressions: number(data?.today?.impressions), amount: number(data?.today?.amount) }, days, week, paying };
}

/**
 * Paid impressions of a game between two days, for the Performance tab. Returns null when the wallet is missing, else
 *   places     [{ day, placement_id, place_id, impressions }]
 *   campaigns  [{ id, name, advertiser, placement_id, place_id, impressions }]
 */
export async function loadGamePaid(service, gameId, win) {
  const { data, error } = await service.rpc("wallet_game", { p_game: gameId, p_from: win.from, p_to: win.to });
  if (error) {
    logged("game", error);
    return null;
  }
  const rows = data?.campaigns ?? [];
  const cards = await campaignCards(service, rows.map((row) => row.campaign_id), new Map(rows.map((row) => [row.campaign_id, row.advertiser_id])));
  return {
    places: data?.places ?? [],
    campaigns: rows.map((row) => ({ id: row.campaign_id, name: cards.get(row.campaign_id)?.name ?? "Deleted campaign", advertiser: cards.get(row.campaign_id)?.advertiser ?? "Unknown", placement_id: row.placement_id, place_id: row.place_id ?? null, impressions: number(row.impressions) })),
  };
}

/**
 * Paid impressions per campaign, creative and day in one game, for the Campaigns tab: Map "campaignId:creativeId" ->
 * impressions per day aligned with `days` (ISO days, oldest first). Null when the wallet is missing.
 */
export async function loadGameCreativesPaid(service, gameId, days) {
  const { data, error } = await service.rpc("wallet_game_creatives", { p_game: gameId, p_from: days[0], p_to: days.at(-1) });
  if (error) {
    logged("game creatives", error);
    return null;
  }
  const index = new Map(days.map((day, position) => [day, position]));
  const paid = new Map();
  for (const row of data ?? []) {
    const position = index.get(String(row.day).slice(0, 10));
    if (position === undefined) continue;
    const key = `${row.campaign_id}:${row.creative_id}`;
    if (!paid.has(key)) paid.set(key, new Array(days.length).fill(0));
    paid.get(key)[position] += number(row.impressions);
  }
  return paid;
}

/**
 * Paid impressions of a game per campaign, creative and placement (migration 0062), one number per day:
 * Map("campaignId:creativeId:placementId" -> [per day]). Null when it cannot be read (no wallet, or 0062 not applied).
 */
export async function loadGamePicturesPaid(service, gameId, days) {
  const { data, error } = await service.rpc("wallet_game_pictures", { p_game: gameId, p_from: days[0], p_to: days.at(-1) });
  if (error) {
    logged("game pictures", error);
    return null;
  }
  const index = new Map(days.map((day, position) => [day, position]));
  const paid = new Map();
  for (const row of data ?? []) {
    const position = index.get(String(row.day).slice(0, 10));
    if (position === undefined) continue;
    const key = `${row.campaign_id}:${row.creative_id}:${row.placement_id}`;
    if (!paid.has(key)) paid.set(key, new Array(days.length).fill(0));
    paid.get(key)[position] += number(row.impressions);
  }
  return paid;
}

/**
 * The platform's books, for the admin. Returns { missing } or:
 *   total, today   { impressions, amount }: everything advertisers paid
 *   days, daily    the last 30 UTC days and the impressions paid on each
 *   campaigns      [{ id, name, advertiser, coverCss, status, budget, impressions }] all time, most paid first
 *   games          [{ id, name, developer, iconUrl, impressions }] all time, most paid first
 *   added          credits advertisers added to their wallets        noLimit  paid by campaigns with no limit
 */
export async function loadPlatformWallet(service, { now = Date.now() } = {}) {
  const days = lastDays(30, now);
  const { data, error } = await service.rpc("wallet_platform", { p_from: days[0], p_to: days.at(-1) });
  if (error) {
    logged("platform", error);
    return { missing: walletMissing(error), failed: !walletMissing(error) };
  }
  const byDay = new Map((data?.daily ?? []).map((row) => [String(row.day).slice(0, 10), number(row.impressions)]));
  const campaignRows = data?.campaigns ?? [];
  const gameRows = data?.games ?? [];
  const campaignIds = campaignRows.map((row) => row.campaign_id);
  const gameIds = gameRows.map((row) => row.game_id);
  const developerIds = [...new Set(gameRows.map((row) => row.developer_id))].filter(Boolean);
  const [cards, live, games, developers] = await Promise.all([
    campaignCards(service, campaignIds, new Map(campaignRows.map((row) => [row.campaign_id, row.advertiser_id]))),
    campaignIds.length ? service.from("bookings").select("campaign_id").eq("status", "approved").in("campaign_id", campaignIds).limit(10000) : { data: [] },
    gameIds.length ? service.from("games").select("id, name, icon_path").in("id", gameIds) : { data: [] },
    developerIds.length ? service.from("accounts").select("id, email, company").in("id", developerIds) : { data: [] },
  ]);
  const liveSet = new Set((live.data ?? []).map((row) => row.campaign_id));
  const gameOf = new Map((games.data ?? []).map((row) => [row.id, row]));
  const developerOf = new Map((developers.data ?? []).map((row) => [row.id, row]));
  const sum = (part) => ({ impressions: number(part?.impressions), amount: number(part?.amount) });
  return {
    total: sum(data?.total),
    today: sum(data?.today),
    days,
    daily: days.map((day) => byDay.get(day) ?? 0),
    campaigns: campaignRows.map((row) => {
      // a line of the books always has its campaign id; a card is made for every id, also for a campaign since deleted
      const card = cards.get(row.campaign_id) ?? { name: "Deleted campaign", advertiser: "Unknown", coverCss: "", deleted: true, budget: budgetOf(null) };
      return { id: row.campaign_id, name: card.name, advertiser: card.advertiser, coverCss: card.coverCss, status: outsideStatus(card, liveSet.has(row.campaign_id)), budget: card.budget, impressions: number(row.impressions), amount: number(row.amount) };
    }),
    games: gameRows.map((row) => {
      const game = gameOf.get(row.game_id);
      return { id: row.game_id, name: game?.name ?? "Deleted game", developer: who(developerOf.get(row.developer_id)), iconUrl: game?.icon_path ? urlOf(service)(game.icon_path) : "", impressions: number(row.impressions), amount: number(row.amount) };
    }),
    added: number(data?.added),
    noLimit: number(data?.no_limit),
  };
}
