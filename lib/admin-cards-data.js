// What the admin cards (user, creative, booking, game, dispute) show. Server only: each loader takes the service client
// and an id and returns plain, serialisable data, or null when there is nothing with that id.
import { loadBookings } from "./bookings-data.js";
import { attachControls } from "./advertiser-data.js";
import { activeAccountIds } from "./admin-rules.js";
import { doingNow } from "./admin-users.js";
import { reviewRows, creativeEvents } from "./admin-review.js";
import { bookingRows, bookingEvents, bookingNow } from "./admin-bookings.js";
import { disputeRows, disputeEvents } from "./admin-disputes.js";
import { connection } from "./connection.js";
import { coverBackground } from "./game-cover.js";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const who = (a) => a?.company || a?.email || "Unknown";
const urlOf = (service) => (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;
const names = async (service, ids) => {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { data } = await service.from("accounts").select("id, email, company").in("id", list);
  return new Map((data ?? []).map((a) => [a.id, who(a)]));
};

/** Disputes about one creative in one game (or about the creative anywhere when `gameId` is null), with names filled in. */
async function disputesFor(service, { creativeId, gameId = null, gameIds = null }) {
  let query = service.from("creative_disputes").select("*").order("created_at", { ascending: true });
  if (creativeId) query = query.eq("creative_id", creativeId);
  if (gameId) query = query.eq("game_id", gameId);
  if (gameIds) query = query.in("game_id", gameIds);
  const { data, error } = await query;
  if (error) return [];
  const accounts = await names(service, (data ?? []).flatMap((d) => [d.developer_id, d.advertiser_id]));
  const { data: games } = await service.from("games").select("id, name").in("id", [...new Set((data ?? []).map((d) => d.game_id))]);
  const gameName = new Map((games ?? []).map((g) => [g.id, g.name]));
  return (data ?? []).map((d) => {
    const initiator = d.initiator === "advertiser" ? "advertiser" : "developer";
    return { ...d, initiator, byName: accounts.get(initiator === "advertiser" ? d.advertiser_id : d.developer_id) ?? (initiator === "advertiser" ? "Advertiser" : "Developer"), gameName: gameName.get(d.game_id) ?? "Game" };
  });
}

const disputeBrief = (d) => ({ id: d.id, reason: d.reason, initiator: d.initiator, status: d.status, outcome: d.outcome ?? null, when: String(d.created_at).slice(0, 10), game: d.gameName });

export async function loadUserCard(service, id, selfId) {
  if (!UUID.test(id)) return null;
  let { data: a, error } = await service.from("accounts").select("id, email, company, role, created_at, suspended_at, avatar_path").eq("id", id).maybeSingle();
  if (error) ({ data: a } = await service.from("accounts").select("id, email, company, role, created_at").eq("id", id).maybeSingle());
  if (!a) return null;
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: games }, { data: campaigns }, { data: approved }] = await Promise.all([
    service.from("games").select("id, name").eq("owner_id", id),
    service.from("campaigns").select("id").eq("advertiser_id", id),
    service.from("bookings").select("advertiser_id, status, starts_on, ends_on").eq("advertiser_id", id).eq("status", "approved"),
  ]);
  const active = activeAccountIds((games ?? []).map(() => id), approved ?? [], today).has(id);
  return {
    id: a.id,
    company: a.company ?? "",
    email: a.email ?? "",
    role: a.role,
    joined: String(a.created_at).slice(0, 10),
    suspended: Boolean(a.suspended_at),
    active,
    doing: doingNow({ role: a.role, games: (games ?? []).length, campaigns: (campaigns ?? []).length, active }),
    games: games ?? [],
    avatarUrl: a.avatar_path ? urlOf(service)(a.avatar_path) : null,
    self: a.id === selfId,
  };
}

export async function loadCreativeCard(service, id) {
  if (!UUID.test(id)) return null;
  const read = (columns) => service.from("creatives").select(columns).eq("id", id).maybeSingle();
  const base = "id, name, storage_path, width_px, height_px, status, created_at, owner_id, accounts(email, company)";
  let { data, error } = await read(`${base}, review_note, reviewed_at, ad_category`);
  if (error) ({ data } = await read(base));
  if (!data) return null;
  const { creatives } = reviewRows({ creatives: [data], urlOf: urlOf(service) });
  const row = creatives[0];
  const { bookings } = await loadBookings(service, (q) => q.eq("creative_id", id), { limit: 200 });
  await attachControls(service, bookings);
  const disputes = await disputesFor(service, { creativeId: id });
  const rows = bookingRows({ bookings });
  return {
    row,
    bookings: rows.map((b) => ({ id: b.id, game: b.game, placement: b.placement, advertiser: b.advertiser, developer: b.developer, dates: b.dates, state: b.state })),
    events: creativeEvents({ row, bookings: bookings.map((b) => ({ ...b, createdAt: b.createdAt })), disputes }),
    openDisputes: disputes.filter((d) => d.status === "open").length,
    disputes: disputes.map(disputeBrief),
  };
}

export async function loadBookingCard(service, id, adminPaused = new Set()) {
  if (!UUID.test(id)) return null;
  const { bookings } = await loadBookings(service, (q) => q.eq("id", id), { limit: 1 });
  if (!bookings.length) return null;
  await attachControls(service, bookings);
  const paused = await adminPausedIds(service, [id]);
  const b = bookings[0];
  let impressions = null;
  if (b.placementId && b.creativeId) {
    const { count, error } = await service.from("impressions").select("id", { count: "exact", head: true }).eq("placement_id", b.placementId).eq("creative_id", b.creativeId);
    if (!error) impressions = count ?? 0;
  }
  const key = `${b.placementId}:${b.creativeId}`;
  const [row] = bookingRows({ bookings, impressions: impressions == null ? null : new Map([[key, impressions]]), adminPaused: new Set([...adminPaused, ...paused]) });
  const disputes = b.gameId ? await disputesFor(service, { creativeId: b.creativeId, gameId: b.gameId }) : [];
  return {
    row,
    now: bookingNow(row, disputes.filter((d) => d.status === "open").length),
    events: bookingEvents(row, disputes),
    disputes: disputes.map(disputeBrief),
  };
}

/** Ids among `ids` that an admin paused (migration 0045; empty before it). */
export async function adminPausedIds(service, ids) {
  if (!ids.length) return new Set();
  const { data, error } = await service.from("bookings").select("id").in("id", ids).not("admin_paused_at", "is", null);
  return error ? new Set() : new Set((data ?? []).map((r) => r.id));
}

export async function loadGameCard(service, id) {
  if (!UUID.test(id)) return null;
  const { data: g } = await service.from("games").select("*").eq("id", id).maybeSingle();
  if (!g) return null;
  const [owner, placements, bookingsResult] = await Promise.all([
    names(service, [g.owner_id]),
    service.from("placements").select("id").eq("game_id", id).is("removed_at", null),
    service.from("placements").select("id").eq("game_id", id),
  ]);
  const placementIds = (bookingsResult.data ?? []).map((p) => p.id);
  const { bookings } = placementIds.length ? await loadBookings(service, (q) => q.in("placement_id", placementIds), { limit: 300 }) : { bookings: [] };
  await attachControls(service, bookings);
  const paused = await adminPausedIds(service, bookings.map((b) => b.id));
  const rows = bookingRows({ bookings, adminPaused: paused });
  const disputes = await disputesFor(service, { gameId: id });
  const u = urlOf(service);
  const conn = connection(g.last_signal_at ?? null);
  return {
    id: g.id,
    name: g.name,
    iconUrl: g.icon_path ? u(g.icon_path) : "",
    coverCss: coverBackground(g.cover ?? null, 0, u),
    conn: { mode: conn.mode, label: conn.label, line: conn.line },
    developer: { id: g.owner_id, name: owner.get(g.owner_id) ?? "Developer" },
    facts: [g.genres?.length ? g.genres.join(", ") : null, g.platforms?.length ? g.platforms.join(", ") : null, g.created_at ? `added ${String(g.created_at).slice(0, 10)}` : null].filter(Boolean),
    placements: (placements.data ?? []).length,
    campaigns: new Set(bookings.map((b) => b.campaignId)).size,
    bookings: rows.map((b) => ({ id: b.id, creative: b.creative, advertiser: b.advertiser, placement: b.placement, state: b.state })),
    disputes: disputes.map(disputeBrief),
  };
}

/** Disputes as rows for the table (admin-disputes.js), with names, creative and category filled in. `scope` narrows the query. */
export async function loadDisputeRows(service, scope = (q) => q, limit = 500) {
  const { data, error } = await scope(service.from("creative_disputes").select("*").order("created_at", { ascending: false }).limit(limit));
  if (error) return { error, rows: [] };
  const list = data ?? [];
  const creativeIds = [...new Set(list.map((d) => d.creative_id).filter(Boolean))];
  const gameIds = [...new Set(list.map((d) => d.game_id).filter(Boolean))];
  const [creatives, games] = await Promise.all([
    creativeIds.length ? service.from("creatives").select("id, name, storage_path, ad_category, owner_id").in("id", creativeIds) : { data: [] },
    gameIds.length ? service.from("games").select("id, name").in("id", gameIds) : { data: [] },
  ]);
  const creativeOf = new Map((creatives.data ?? []).map((c) => [c.id, c]));
  const gameName = new Map((games.data ?? []).map((g) => [g.id, g.name]));
  const accounts = await names(service, list.flatMap((d) => [d.developer_id, d.advertiser_id, creativeOf.get(d.creative_id)?.owner_id]));
  const u = urlOf(service);
  const shaped = list.map((d) => {
    const c = creativeOf.get(d.creative_id);
    const initiator = d.initiator === "advertiser" ? "advertiser" : "developer";
    const advertiserId = d.advertiser_id ?? c?.owner_id ?? null;
    const dev = accounts.get(d.developer_id) ?? "Developer";
    const adv = accounts.get(advertiserId) ?? "Advertiser";
    return { ...d, initiator, advertiser_id: advertiserId, byName: initiator === "advertiser" ? adv : dev, againstName: initiator === "advertiser" ? dev : adv, gameName: gameName.get(d.game_id) ?? "Game", creativeName: c?.name ?? "Creative", creativeUrl: c?.storage_path ? u(c.storage_path) : "", category: c?.ad_category };
  });
  return { rows: disputeRows(shaped) };
}

export async function loadDisputeCard(service, id) {
  if (!UUID.test(id)) return null;
  const { rows } = await loadDisputeRows(service, (q) => q.eq("id", id), 1);
  const row = rows[0];
  if (!row) return null;
  const { data } = await service.from("dispute_events").select("author_id, side, kind, text, created_at").eq("dispute_id", id).eq("kind", "reply").order("created_at");
  const replies = (data ?? []).map((x) => ({ ...x, who: x.side === "admin" ? "Admin" : x.side === "advertiser" ? row.initiator === "advertiser" ? row.by : row.against : row.initiator === "developer" ? row.by : row.against }));
  let booking = null;
  if (row.bookingId) {
    const { bookings } = await loadBookings(service, (q) => q.eq("id", row.bookingId), { limit: 1 });
    booking = bookings[0] ? { id: bookings[0].id, placement: bookings[0].placement } : null;
  }
  return { row, booking, events: disputeEvents(row, replies) };
}
