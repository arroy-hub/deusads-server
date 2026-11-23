// Everything the Home page (/dashboard/home) reads, for a developer and for an advertiser. Every query answers
// "nothing" when a table or column is missing (a migration not applied yet), so Home can never fail to open.

import { isSchemaOutdated } from "./api.js";
import { loadHomeAttention } from "./advertiser-data.js";
import { connection } from "./connection.js";
import { newByGame } from "./overview-data.js";
import { advertiserChecklist, advertiserStrips, advertiserWallet, developerChecklist, developerStrips, developerWallet, groupActivity, homeMode, mergeActivity, walletActivity } from "./home-rules.js";
import { budgetWatch } from "./wallet.js";
import { loadDeveloperGlance } from "./wallet-data.js";

const count = async (query) => {
  const { count: total, error } = await query;
  return error ? 0 : (total ?? 0);
};

/** The tone and icon of a Recent activity row, from where the notification leads (the mockup gives each row its own). */
export function activityLook(link = "") {
  const to = String(link || "");
  if (to.includes("/requests")) return { tone: "ans", icon: "chat" };
  if (to.includes("/wallet")) return { tone: "live", icon: "wallet" };
  if (to.includes("/creatives")) return { tone: "live", icon: "image" };
  if (to.includes("/advertising") || to.includes("/g/")) return { tone: "sched", icon: "mega" };
  return { tone: "mute", icon: "pulse" };
}

/** The last notifications of the person as rows of Recent activity, newest first: [{ id, at, text, href, tone, icon }]. */
async function recentActivity(service, userId) {
  const { data, error } = await service.from("notifications").select("id, text, link, created_at").eq("account_id", userId).order("created_at", { ascending: false }).limit(300);
  if (error) return [];
  // A burst of the same kind (ten new ads in a few minutes) is one row; the six newest rows are what Home shows.
  return groupActivity(data ?? []).slice(0, 6).map((row) => ({ id: row.id, at: row.created_at, text: row.text, href: row.link || "", ...activityLook(row.link) }));
}

/**
 * What an advertiser's wallet holds and its last operations, or null when there is no wallet yet (migration 0061):
 * { available, spentToday, ops: [{ id, kind, campaignName, amount, at }] }.
 */
async function advertiserWalletFacts(service, userId) {
  const [summary, ops] = await Promise.all([
    service.rpc("wallet_advertiser", { p_account: userId }),
    service.from("wallet_ops").select("id, kind, campaign_name, amount, created_at").eq("account_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6),
  ]);
  if (summary.error || ops.error) return null;
  return {
    available: Number(summary.data?.available) || 0,
    spentToday: Number(summary.data?.spent_today) || 0,
    ops: (ops.data ?? []).map((row) => ({ id: row.id, kind: row.kind, campaignName: row.campaign_name ?? "", amount: Number(row.amount) || 0, at: row.created_at })),
  };
}

async function developerHome(service, user) {
  const read = (columns) => service.from("games").select(`id, name, placements(${columns})`).eq("owner_id", user.id).order("created_at", { ascending: true });
  const profileRows = service.from("games").select("id, name, last_signal_at, genres, platforms, countries").eq("owner_id", user.id).order("created_at", { ascending: true });
  const [{ data: withPlacements }, profiles, activity, glance] = await Promise.all([
    read("id, removed_at"),
    profileRows.then(async (result) => (isSchemaOutdated(result.error) ? service.from("games").select("id, name, last_signal_at").eq("owner_id", user.id).order("created_at", { ascending: true }) : result)),
    recentActivity(service, user.id),
    // what the games earned (the wallet, migration 0061); without it Home has no Wallet block
    loadDeveloperGlance(service, user.id).catch(() => ({ missing: true })),
  ]);
  const profile = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  const rows = (withPlacements ?? []).map((game) => {
    const extra = profile.get(game.id) ?? {};
    const live = (game.placements ?? []).filter((placement) => !placement.removed_at);
    const link = connection(extra.last_signal_at ?? null);
    const filled = Boolean(extra.genres?.length && extra.platforms?.length && extra.countries?.length);
    return { id: game.id, name: game.name, placements: live.length, lastSignalAt: extra.last_signal_at ?? null, quietDays: link.mode === "silent" ? link.days : null, connected: link.mode !== "new", filled };
  });

  // What is new in each game's Campaigns tab (the same rule as the marker on the game's card on My games).
  const news = await newByGame(service, rows.map((row) => row.id)).catch(() => new Map());
  const fresh = rows.map((row) => ({ gameId: row.id, game: row.name, ...(news.get(row.id) ?? {}) }));

  const stats = { games: rows.length, detailsFilled: rows.filter((row) => row.filled).length, connected: rows.filter((row) => row.connected).length, placements: rows.reduce((sum, row) => sum + row.placements, 0) };
  return {
    mode: homeMode("developer", { games: rows.length }),
    checklist: developerChecklist(stats),
    strips: developerStrips({ games: rows, fresh }),
    activity: mergeActivity([activity]),
    wallet: glance.missing ? null : developerWallet(glance),
    sub: rows.length ? `${rows.length} ${rows.length === 1 ? "game" : "games"}` : "No games yet",
  };
}

async function advertiserHome(service, me) {
  const { user } = me;
  const [creatives, campaigns, bookings, started, attention, activity, facts] = await Promise.all([
    count(service.from("creatives").select("id", { count: "exact", head: true }).eq("owner_id", user.id).neq("kind", "own")),
    count(service.from("campaigns").select("id", { count: "exact", head: true }).eq("advertiser_id", user.id)),
    count(service.from("bookings").select("id", { count: "exact", head: true }).eq("advertiser_id", user.id)),
    count(service.from("bookings").select("id", { count: "exact", head: true }).eq("advertiser_id", user.id).in("status", ["approved", "pending", "ended"])),
    loadHomeAttention(service, me).catch(() => ({ items: [], budgets: [] })),
    recentActivity(service, user.id),
    advertiserWalletFacts(service, user.id).catch(() => null),
  ]);
  return {
    mode: homeMode("advertiser", { creatives, campaigns }),
    checklist: advertiserChecklist({ creatives, campaigns, bookings, started }),
    strips: advertiserStrips(attention.items),
    // the wallet's own operations (credits added, budgets reserved and returned) stand in the list beside the notifications
    activity: mergeActivity([activity, walletActivity(facts?.ops)]),
    wallet: facts ? advertiserWallet(facts, budgetWatch(attention.budgets)) : null,
    sub: campaigns ? `${campaigns} ${campaigns === 1 ? "campaign" : "campaigns"}` : "No campaigns yet",
  };
}

/** { mode, checklist, strips, activity, wallet, sub } for the signed-in developer or advertiser. `wallet` is null without migration 0061. */
export function loadHome(me) {
  return me.role === "advertiser" ? advertiserHome(me.service, me) : developerHome(me.service, me.user);
}
