// Everything the Home page (/dashboard/home) reads, for a developer and for an advertiser. Every query answers
// "nothing" when a table or column is missing (a migration not applied yet), so Home can never fail to open.

import { isSchemaOutdated } from "./api.js";
import { loadAttention } from "./advertiser-data.js";
import { loadBookings } from "./bookings-data.js";
import { connection } from "./connection.js";
import { advertiserChecklist, advertiserStrips, activityWhen, developerChecklist, developerStrips, homeMode } from "./home-rules.js";

const count = async (query) => {
  const { count: total, error } = await query;
  return error ? 0 : (total ?? 0);
};

/** The last notifications of the person as the Recent activity list: [{ id, text, when, href }]. */
async function recentActivity(service, userId) {
  const { data, error } = await service.from("notifications").select("id, text, link, created_at").eq("account_id", userId).order("created_at", { ascending: false }).limit(6);
  if (error) return [];
  return (data ?? []).map((row) => ({ id: row.id, text: row.text, href: row.link || "", when: activityWhen(row.created_at) }));
}

async function developerHome(service, user) {
  const read = (columns) => service.from("games").select(`id, name, placements(${columns})`).eq("owner_id", user.id).order("created_at", { ascending: true });
  const profileRows = service.from("games").select("id, name, last_signal_at, genres, platforms, countries").eq("owner_id", user.id).order("created_at", { ascending: true });
  const [{ data: withPlacements }, profiles, activity, booked] = await Promise.all([
    read("id, removed_at"),
    profileRows.then(async (result) => (isSchemaOutdated(result.error) ? service.from("games").select("id, name, last_signal_at").eq("owner_id", user.id).order("created_at", { ascending: true }) : result)),
    recentActivity(service, user.id),
    loadBookings(service, (query) => query.eq("developer_id", user.id), { limit: 60 }),
  ]);
  const profile = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  const rows = (withPlacements ?? []).map((game) => {
    const extra = profile.get(game.id) ?? {};
    const live = (game.placements ?? []).filter((placement) => !placement.removed_at);
    const link = connection(extra.last_signal_at ?? null);
    const filled = Boolean(extra.genres?.length && extra.platforms?.length && extra.countries?.length);
    return { id: game.id, name: game.name, placements: live.length, lastSignalAt: extra.last_signal_at ?? null, quietDays: link.mode === "silent" ? link.days : null, connected: link.mode !== "new", filled };
  });

  // A campaign counts once per game: the first booking found for it.
  const seen = new Set();
  const campaigns = [];
  for (const booking of booked.bookings ?? []) {
    if (booking.status !== "approved" || !booking.startsOn || !booking.gameId) continue;
    const key = `${booking.campaignId}:${booking.gameId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    campaigns.push({ id: key, gameId: booking.gameId, game: booking.game, advertiser: booking.advertiser, campaign: booking.campaign, startsOn: booking.startsOn });
  }

  const stats = { games: rows.length, detailsFilled: rows.filter((row) => row.filled).length, connected: rows.filter((row) => row.connected).length, placements: rows.reduce((sum, row) => sum + row.placements, 0) };
  return {
    mode: homeMode("developer", { games: rows.length }),
    checklist: developerChecklist(stats),
    strips: developerStrips({ games: rows, campaigns }),
    activity,
    sub: rows.length ? `${rows.length} ${rows.length === 1 ? "game" : "games"}` : "No games yet",
  };
}

async function advertiserHome(service, me) {
  const { user } = me;
  const [creatives, campaigns, bookings, started, items, activity] = await Promise.all([
    count(service.from("creatives").select("id", { count: "exact", head: true }).eq("owner_id", user.id).neq("kind", "own")),
    count(service.from("campaigns").select("id", { count: "exact", head: true }).eq("advertiser_id", user.id)),
    count(service.from("bookings").select("id", { count: "exact", head: true }).eq("advertiser_id", user.id)),
    count(service.from("bookings").select("id", { count: "exact", head: true }).eq("advertiser_id", user.id).in("status", ["approved", "pending", "ended"])),
    loadAttention(service, me).catch(() => []),
    recentActivity(service, user.id),
  ]);
  return {
    mode: homeMode("advertiser", { creatives, campaigns }),
    checklist: advertiserChecklist({ creatives, campaigns, bookings, started }),
    strips: advertiserStrips(items),
    activity,
    sub: campaigns ? `${campaigns} ${campaigns === 1 ? "campaign" : "campaigns"}` : "No campaigns yet",
  };
}

/** { mode, checklist, strips, activity, sub } for the signed-in developer or advertiser. */
export function loadHome(me) {
  return me.role === "advertiser" ? advertiserHome(me.service, me) : developerHome(me.service, me.user);
}
