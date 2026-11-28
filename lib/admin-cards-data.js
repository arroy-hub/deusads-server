// What the admin cards (user, creative, booking, game, dispute) show. Server only: each loader takes the service client
// and an id and returns plain, serialisable data, or null when there is nothing with that id.
import { loadBookings } from "./bookings-data.js";
import { pictureFor, shapeAspect, shapeKey, shapeLabel } from "./game-pictures.js";
import { loadPictureInputs } from "./picture-landing.js";
import { earnedOf } from "./wallet.js";
import { attachControls } from "./advertiser-data.js";
import { activeAccountIds } from "./admin-rules.js";
import { doingNow } from "./admin-users.js";
import { reviewRows, creativeEvents } from "./admin-review.js";
import { bookingRows, bookingEvents, bookingNow, stateLabel, STATES } from "./admin-bookings.js";
import { disputeRows, disputeEvents, disputeNow } from "./admin-disputes.js";
import { connection } from "./connection.js";
import { fdt } from "./admin-format.js";
import { coverBackground } from "./game-cover.js";
import { loadAccountView } from "./account-data.js";
import { countryOptions } from "./account-rules.js";

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

const disputeBrief = (d) => ({ id: d.id, reason: d.reason, initiator: d.initiator, status: d.status, outcome: d.outcome ?? null, when: fdt(d.created_at), game: d.gameName });

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
    // the same account data the owner's page shows, and the country list, for the Profile / Sign-in / Notifications tabs
    view: await loadAccountView({ service, db: null, id, self: false }),
    countries: countryOptions(),
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
  const paused = await adminPausedIds(service, bookings.map((b) => b.id));
  const rows = bookingRows({ bookings, adminPaused: paused });
  const shaped = rows.map((b) => ({ ...b, statusLabel: stateLabel(b) }));
  return {
    row,
    bookings: shaped.map((b) => ({ id: b.id, game: b.game, placement: b.placement, advertiser: b.advertiser, developer: b.developer, period: b.period, state: b.state, label: STATES[b.state].short })),
    events: creativeEvents({ row, bookings: shaped, disputes }),
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
  const emails = await emailsOf(service, [b.advertiserId, b.developerId]);
  const ctx = { advEmail: emails.get(b.advertiserId) ?? "", devEmail: emails.get(b.developerId) ?? "" };
  return {
    row: { ...row, statusLabel: stateLabel(row), short: STATES[row.state].short },
    now: bookingNow(row, disputes.filter((d) => d.status === "open").length),
    events: bookingEvents(row, disputes, ctx),
    disputes: disputes.map(disputeBrief),
  };
}

/** Ids among `ids` that an admin paused (migration 0045; empty before it). */
export async function adminPausedIds(service, ids) {
  if (!ids.length) return new Set();
  // Asked without a list of ids: a thousand ids in the address is longer than the database accepts. Few bookings are paused by an admin.
  const { data, error } = await service.from("bookings").select("id").not("admin_paused_at", "is", null).limit(5000);
  if (error) return new Set();
  const wanted = new Set(ids);
  return new Set((data ?? []).map((r) => r.id).filter((id) => wanted.has(id)));
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
    facts: [g.genres?.length ? g.genres.join(", ") : null, g.platforms?.length ? g.platforms.join(", ") : null, g.created_at ? `added ${fdt(g.created_at)}` : null].filter(Boolean),
    placements: (placements.data ?? []).length,
    campaigns: new Set(bookings.map((b) => b.campaignId)).size,
    bookings: rows.map((b) => ({ id: b.id, creative: b.creative, advertiser: b.advertiser, placement: b.placement, state: b.state, label: STATES[b.state].short })),
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
    creativeIds.length ? service.from("creatives").select("*").in("id", creativeIds) : { data: [] }, // "*": the hold columns are there since migration 0064
    gameIds.length ? service.from("games").select("id, name").in("id", gameIds) : { data: [] },
  ]);
  const creativeOf = new Map((creatives.data ?? []).map((c) => [c.id, c]));
  const gameName = new Map((games.data ?? []).map((g) => [g.id, g.name]));
  const accounts = await names(service, list.flatMap((d) => [d.developer_id, d.advertiser_id, creativeOf.get(d.creative_id)?.owner_id]));

  // After a removal: did the advertiser upload another creative in the same category, and was it approved? (a later upload by the same owner)
  const removed = list.filter((d) => d.status !== "open" && d.outcome === "removed" && d.resolved_at);
  const owners = [...new Set(removed.map((d) => creativeOf.get(d.creative_id)?.owner_id).filter(Boolean))];
  let later = [];
  if (owners.length) {
    const since = removed.map((d) => d.resolved_at).sort()[0];
    const { data: more } = await service.from("creatives").select("id, owner_id, ad_category, status, created_at").in("owner_id", owners).gte("created_at", since).limit(2000);
    later = more ?? [];
  }

  // Conversations with advertisers about creatives on hold: an advertiser who wrote last waits for an answer.
  const lastSide = new Map();
  if (list.length) {
    const { data: talk } = await service.from("dispute_events").select("dispute_id, side, created_at").in("dispute_id", list.map((d) => d.id)).eq("kind", "reply").in("side", ["advertiser", "admin"]).order("created_at", { ascending: true }).limit(5000);
    for (const e of talk ?? []) lastSide.set(e.dispute_id, e.side);
  }

  // What each decision holds now: a single picture (migration 0065) or, for a report about a whole creative, the creative.
  const pictureHolds = new Map();
  if (list.length) {
    const { data: rows, error: holdsError } = await service.from("creative_picture_holds").select("dispute_id, kind, sent_at").in("dispute_id", list.map((d) => d.id));
    if (!holdsError) for (const row of rows ?? []) pictureHolds.set(row.dispute_id, row);
  }
  const holdOfDispute = (d, c) => {
    const picture = pictureHolds.get(d.id);
    if (picture) return { held: picture.kind, resent: picture.kind === "changes" && Boolean(picture.sent_at), heldHere: true };
    const here = Boolean(c?.hold) && c?.hold_dispute === d.id;
    return { held: here ? c.hold : null, resent: here && c.hold === "changes" && c.status === "pending", heldHere: here };
  };

  const u = urlOf(service);
  // A report about one picture (a creative in one shape, migration 0063) shows that picture, not the creative's main one.
  const pictured = list.filter((d) => d.shape);
  const inputs = pictured.length ? await loadPictureInputs(service, { creativeIds: pictured.map((d) => d.creative_id) }).catch(() => null) : null;
  const pictureUrl = (d) => {
    if (!d.shape || !inputs) return "";
    const pick = pictureFor({ creative: inputs.creativeOf.get(d.creative_id), assets: inputs.assetsOf.get(d.creative_id) ?? [], aspect: shapeAspect(d.shape) });
    return pick.kind === "asset" && pick.asset?.storagePath ? u(pick.asset.storagePath) : "";
  };
  const shaped = list.map((d) => {
    const c = creativeOf.get(d.creative_id);
    const initiator = d.initiator === "advertiser" ? "advertiser" : "developer";
    const advertiserId = d.advertiser_id ?? c?.owner_id ?? null;
    const dev = accounts.get(d.developer_id) ?? "Developer";
    const adv = accounts.get(advertiserId) ?? "Advertiser";
    const next = d.outcome === "removed" && d.resolved_at ? later.filter((x) => x.owner_id === c?.owner_id && x.id !== c?.id && x.ad_category === c?.ad_category && x.created_at > d.resolved_at) : [];
    const holding = holdOfDispute(d, c);
    return { ...d, ...holding, waiting: lastSide.get(d.id) === "advertiser" && holding.heldHere, initiator, advertiser_id: advertiserId, byName: initiator === "advertiser" ? adv : dev, againstName: initiator === "advertiser" ? dev : adv, gameName: gameName.get(d.game_id) ?? "Game", creativeName: c?.name ?? "Creative", creativeUrl: pictureUrl(d) || (c?.storage_path ? u(c.storage_path) : ""), shapeLabel: d.shape ? shapeLabel(d.shape) : "", category: c?.ad_category, reuploaded: next.length > 0, reapproved: next.some((x) => x.status === "approved") };
  });
  return { rows: disputeRows(shaped) };
}

async function emailsOf(service, ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { data } = await service.from("accounts").select("id, email").in("id", list);
  return new Map((data ?? []).map((a) => [a.id, a.email]));
}

/** Where a reported creative (or one picture of it) stands in the game, as the `booking` of a dispute card. */
async function reportedIn(service, row) {
  const { data: places } = await service.from("placements").select("id, label, external_id, aspect_ratio").eq("game_id", row.gameId);
  const spots = (places ?? []).filter((place) => !row.shape || shapeKey(place.aspect_ratio) === row.shape);
  if (!spots.length) return null;
  const { bookings } = await loadBookings(service, (q) => q.eq("creative_id", row.creativeId).in("placement_id", spots.map((place) => place.id)), { limit: 100 });
  const same = bookings.filter((b) => !row.campaignId || b.campaignId === row.campaignId);
  const mine = same.length ? same : bookings;
  if (!mine.length) return null;
  const first = mine.find((b) => b.status === "approved") ?? mine[0];
  const ids = [...new Set(mine.map((b) => b.placementId))];
  const [seen, paid] = await Promise.all([
    service.from("impressions").select("id", { count: "exact", head: true }).eq("creative_id", row.creativeId).in("placement_id", ids),
    service.from("wallet_earnings").select("impressions").eq("game_id", row.gameId).eq("creative_id", row.creativeId).in("placement_id", ids).limit(5000),
  ]);
  return {
    id: first.id,
    placement: [...new Set(mine.map((b) => b.placement))].sort().join(", "),
    campaign: first.campaign,
    from: first.startsOn ?? first.created,
    to: first.endsOn ?? "",
    dates: first.dates,
    impressions: seen.error ? null : seen.count ?? 0,
    // what those impressions earned the developer (null without a wallet)
    earned: paid.error ? null : earnedOf((paid.data ?? []).reduce((sum, line) => sum + (Number(line.impressions) || 0), 0)),
  };
}

export async function loadDisputeCard(service, id) {
  if (!UUID.test(id)) return null;
  const { rows } = await loadDisputeRows(service, (q) => q.eq("id", id), 1);
  const row = rows[0];
  if (!row) return null;
  const { data } = await service.from("dispute_events").select("author_id, side, kind, text, created_at").eq("dispute_id", id).in("kind", ["reply", "note", "decision"]).order("created_at");
  // of the decisions only the ones taken back are steps of their own (the decision itself is read from the report)
  const replies = (data ?? []).filter((x) => x.kind !== "decision" || x.text.startsWith("withdrawn")).map((x) => ({ ...x, who: x.side === "admin" ? "DeusADS admin" : x.side === "advertiser" ? row.adv : row.dev }));
  let booking = null;
  if (row.bookingId) {
    const { bookings } = await loadBookings(service, (q) => q.eq("id", row.bookingId), { limit: 1 });
    const b = bookings[0];
    if (b) {
      let impressions = null;
      if (b.placementId && b.creativeId) {
        const { count, error } = await service.from("impressions").select("id", { count: "exact", head: true }).eq("placement_id", b.placementId).eq("creative_id", b.creativeId);
        if (!error) impressions = count ?? 0;
      }
      booking = { id: b.id, placement: b.placement, campaign: b.campaign, from: b.startsOn ?? b.created, to: b.endsOn ?? "", dates: b.dates, impressions };
    }
  }
  // A developer's report names no booking: it is about what the creative shows in the game, so the placements, the
  // booking and the figures are those of the reported picture there (of the whole creative when no shape was given).
  if (!booking && row.initiator === "developer" && row.gameId) booking = await reportedIn(service, row).catch(() => null);
  const { data: cr } = await service.from("creatives").select("id, name, width_px, height_px, created_at, owner_id").eq("id", row.creativeId).maybeSingle();
  const emails = await emailsOf(service, [row.byId, row.againstId, cr?.owner_id]);
  const devId = row.initiator === "developer" ? row.byId : row.againstId;
  const advId = row.initiator === "advertiser" ? row.byId : row.againstId;
  const creative = { id: row.creativeId, name: row.creative, size: cr?.width_px && cr?.height_px ? `${cr.width_px} × ${cr.height_px}` : "", date: cr?.created_at ? String(cr.created_at).slice(0, 10) : "" };
  // How other games took this creative: where it is blocked, and what earlier reports came to.
  let others = "";
  if (row.initiator === "developer") {
    const [pictures, whole, reports] = await Promise.all([
      service.from("game_picture_blocks").select("game_id").eq("creative_id", row.creativeId),
      service.from("game_ad_controls").select("game_id").eq("scope", "creative").eq("target_id", row.creativeId),
      service.from("creative_disputes").select("id, status, outcome").eq("creative_id", row.creativeId).neq("id", row.id),
    ]);
    const games = new Set([...(pictures.data ?? []), ...(whole.data ?? [])].map((x) => x.game_id).filter((g) => g !== row.gameId));
    const earlier = reports.data ?? [];
    const clean = earlier.filter((x) => x.outcome === "dismissed").length;
    const parts = [games.size ? `Blocked by developers in ${games.size} other ${games.size === 1 ? "game" : "games"}` : "Not blocked in any other game"];
    parts.push(earlier.length ? `${earlier.length} other ${earlier.length === 1 ? "report" : "reports"}${clean === earlier.length ? ": no violation found" : clean ? `, ${clean} without a violation` : ""}` : "no other reports");
    others = parts.join(" · ");
  }
  const ctx = { booking, creative, devEmail: emails.get(devId) ?? "", advEmail: emails.get(advId) ?? "", others };
  return {
    row,
    booking,
    creative,
    devId,
    advId,
    campaign: booking?.campaign ?? "",
    now: disputeNow(row, row),
    events: disputeEvents(row, replies, ctx),
  };
}
