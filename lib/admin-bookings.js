// All bookings: what state a booking is in, groups for the table, the history on a booking's card and the figures for
// the board. Pure (no React, no database), so test/admin-bookings.test.mjs can run it.
import { categoryLabel } from "./categories.js";
import { countBy, weekly, bars, ring, stats, cols, GREEN, AMBER, BLUE, GREY, RED, ORANGE, PLUM } from "./admin-stats.js";

const DAY = 864e5;
const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

export const STATES = {
  running: { label: "Running", short: "Running", tone: "good", rank: 1 },
  paused: { label: "Paused", short: "Paused", tone: "warn", rank: 0 },
  scheduled: { label: "Scheduled", short: "Scheduled", tone: "info", rank: 2 },
  ended: { label: "Ended", short: "Ended", tone: "", rank: 3 },
  waiting: { label: "Waiting", short: "Waiting", tone: "info", rank: 2 },
  rejected: { label: "Rejected", short: "Rejected", tone: "bad", rank: 4 },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "", rank: 4 },
};
export const STATE_FILTERS = [["all", "All statuses"], ["running", "Running"], ["paused", "Paused"], ["scheduled", "Scheduled"], ["waiting", "Waiting"], ["ended", "Ended"], ["rejected", "Rejected or cancelled"]];

/**
 * The state a booking is in for the admin. `held` is true when the developer paused or blocked it in the game (migration 0023),
 * `adminPaused` when an admin paused it from a dispute (migration 0045).
 */
export function bookingState({ status, startsOn, endsOn, held = false, adminPaused = false }, today) {
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "pending") return "waiting";
  if (status === "ended" || (endsOn && endsOn < today)) return "ended";
  if (adminPaused || held) return "paused";
  if (startsOn && startsOn > today) return "scheduled";
  return "running";
}

/** Percent of the period that has passed, 0 to 100, or null for a booking with no end date or not yet started. */
export function periodProgress({ startsOn, endsOn, created }, today) {
  if (!endsOn) return null;
  const from = Date.parse(`${startsOn ?? created}T00:00:00Z`), to = Date.parse(`${endsOn}T00:00:00Z`), now = Date.parse(`${today}T00:00:00Z`);
  if (!(to > from)) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - from) / (to - from)) * 100)));
}

const dateText = (b) => b.dates || "No dates";
const impKey = (placementId, creativeId) => `${placementId}:${creativeId}`;

/** Rows for the table from loadBookings rows. `impressions` maps "placementId:creativeId" -> count (or is null when unknown). */
export function bookingRows({ bookings, impressions = null, adminPaused = new Set(), now = Date.now() }) {
  const today = utcDay(now);
  return bookings.map((b) => {
    const state = bookingState({ status: b.status, startsOn: b.startsOn, endsOn: b.endsOn, held: Boolean(b.controlNote), adminPaused: adminPaused.has(b.id) }, today);
    return {
      id: b.id,
      state,
      game: b.game,
      gameId: b.gameId,
      placement: b.placement,
      advertiser: b.advertiser,
      advertiserId: b.advertiserId,
      developer: b.developerName,
      developerId: b.developerId,
      creative: b.creativeName,
      creativeId: b.creativeId,
      creativeUrl: b.creativeUrl,
      creativeSize: b.creativeSize,
      category: b.category,
      categoryLabel: categoryLabel(b.category),
      campaign: b.campaign,
      from: b.startsOn ?? b.created,
      to: b.endsOn ?? "",
      dates: b.dates,
      created: b.created,
      createdAt: b.createdAt ?? b.created,
      startedAt: b.startedAt ?? null,
      decidedAt: b.decidedAt ?? null,
      age: Math.max(0, Math.floor((now - Date.parse(b.createdAt ?? b.created)) / DAY)),
      durationDays: b.endsOn ? Math.round((Date.parse(b.endsOn) - Date.parse(b.startsOn ?? b.created)) / DAY) + 1 : 0,
      progress: state === "scheduled" || state === "waiting" ? 0 : periodProgress({ startsOn: b.startsOn, endsOn: b.endsOn, created: b.created }, today),
      impressions: impressions ? impressions.get(impKey(b.placementId, b.creativeId)) ?? 0 : null,
      held: b.controlNote || "",
      note: b.note || "",
    };
  });
}

export const GROUP_BY = {
  pair: { label: "Advertiser → developer", key: (b) => `${b.advertiserId}|${b.developerId}`, title: (b) => `${b.advertiser} → ${b.developer}`, hide: ["advertiser", "developer"] },
  developer: { label: "Developer", key: (b) => b.developerId, title: (b) => b.developer, hide: ["developer"] },
  advertiser: { label: "Advertiser", key: (b) => b.advertiserId, title: (b) => b.advertiser, hide: ["advertiser"] },
  game: { label: "Game", key: (b) => b.gameId ?? b.game, title: (b) => b.game, hide: ["game"] },
  none: { label: "No grouping", key: null, title: null, hide: [] },
};

/** Groups with problem groups (paused bookings) first, then by number of bookings, then by name; `sortKey` overrides that order. */
export function groupBookings(rows, by, sort = null, value = null) {
  const def = GROUP_BY[by] ?? GROUP_BY.pair;
  if (!def.key) return [];
  const map = new Map();
  for (const b of rows) {
    const k = def.key(b);
    if (!map.has(k)) map.set(k, { key: String(k), title: def.title(b), rows: [] });
    map.get(k).rows.push(b);
  }
  const groups = [...map.values()].map((g) => ({
    ...g,
    counts: countStates(g.rows),
    games: new Set(g.rows.map((r) => r.game)).size,
    from: g.rows.map((r) => r.from).sort()[0],
    to: g.rows.some((r) => !r.to) ? "" : g.rows.map((r) => r.to).sort().at(-1),
    impressions: g.rows.some((r) => r.impressions == null) ? null : g.rows.reduce((t, r) => t + r.impressions, 0),
  }));
  if (sort && value) {
    const sign = sort.dir === "desc" ? -1 : 1;
    return groups.sort((a, b) => {
      const x = value(a, sort.key), y = value(b, sort.key);
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en");
      return sign * order || a.title.localeCompare(b.title, "en");
    });
  }
  return groups.sort((a, b) => (b.counts.paused ?? 0) - (a.counts.paused ?? 0) || b.rows.length - a.rows.length || a.title.localeCompare(b.title, "en"));
}

export function countStates(rows) {
  const out = {};
  for (const r of rows) out[r.state] = (out[r.state] ?? 0) + 1;
  return out;
}

/** What a group or booking is compared by when the table is sorted. */
export function bookingSortValue(item, key, isGroup = false) {
  const rows = isGroup ? item.rows : [item];
  if (key === "imp") return rows.some((r) => r.impressions == null) ? -1 : rows.reduce((t, r) => t + r.impressions, 0);
  if (key === "period") return rows.map((r) => r.from).sort()[0];
  return Math.min(...rows.map((r) => STATES[r.state].rank));
}

/** The history of a booking, oldest first: [{ kind, who, text, at, facts: [[label, value]] }]. `disputes` are rows with `byKind` ("developer" | "advertiser"), `byName`. */
export function bookingEvents(b, disputes = []) {
  const ev = [];
  ev.push({ kind: "adv", who: b.advertiser, text: `Booked "${b.placement}" in ${b.game}`, at: b.createdAt, facts: [["Campaign", b.campaign], ["Creative", `${b.creative}${b.creativeSize ? ` · ${b.creativeSize}` : ""}`], ["Period", dateText(b)], ["Booked by", b.advertiser]] });
  if (b.decidedAt && b.state !== "rejected" && b.state !== "waiting") ev.push({ kind: "ok", who: "System", text: "Approved", at: b.decidedAt, facts: [["Creative", "Approved by review"], ["Rule", "Bookings approve themselves"]] });
  if (b.state === "rejected") ev.push({ kind: "bad", who: "System", text: "Rejected", at: b.decidedAt, facts: [["Reason", b.note || "No reason given"]] });
  if (b.state === "cancelled") ev.push({ kind: "bad", who: "System", text: "Cancelled", at: b.decidedAt, facts: [["Reason", b.note || "Withdrawn by the advertiser"]] });
  if (b.startedAt) ev.push({ kind: "ok", who: "System", text: "Started showing", at: b.startedAt, facts: [["Placement", `${b.placement} · ${b.game}`]] });
  else if (b.state === "scheduled") ev.push({ kind: "sys", who: "System", text: `Starts showing on ${b.from}`, at: null, facts: [["Starts", b.from], ["Ends", b.to || "No end date"]] });
  if (b.held) ev.push({ kind: "dev", who: b.developer, text: "Paused or blocked in the game", at: null, facts: [["Effect", b.held]] });
  if (b.state === "ended") ev.push({ kind: "sys", who: "System", text: "Ended", at: b.to ? `${b.to}T23:59:59Z` : null, facts: [["Reason", "Planned end date reached"]] });
  for (const d of disputes) ev.push({ kind: "report", who: d.byName, text: `Dispute opened: ${d.reason}`, at: d.created_at, facts: [["Opened by", `${d.initiator === "advertiser" ? "Advertiser" : "Developer"} ${d.byName}`], ["Reason", d.reason], ["Outcome", d.status === "open" ? "Still open" : d.outcome === "removed" ? "Creative removed" : d.outcome === "paused" ? "Booking paused" : "Dismissed"]] });
  return ev.sort((a, c) => (a.at ? Date.parse(a.at) : Infinity) - (c.at ? Date.parse(c.at) : Infinity));
}

/** "Now:" line of a booking card. */
export function bookingNow(b, openDisputes = 0) {
  const fmt = (n) => (n == null ? "" : n.toLocaleString("en-US").replace(/,/g, " "));
  const base =
    b.state === "running" ? `Running.${b.impressions != null ? ` ${fmt(b.impressions)} impressions so far` : ""}${b.progress != null ? `, ${b.progress}% of the period.` : "."}`
    : b.state === "paused" ? (b.held ? `Paused. ${b.held}` : "Paused by an admin. Nothing is shown in the game.")
    : b.state === "scheduled" ? `Scheduled. Starts on ${b.from}.`
    : b.state === "waiting" ? "Waiting for the creative to be approved."
    : b.state === "rejected" ? `Rejected${b.note ? `: ${b.note}` : "."}`
    : b.state === "cancelled" ? "Cancelled."
    : `Ended${b.to ? ` on ${b.to}` : ""}.${b.impressions != null ? ` Shown ${fmt(b.impressions)} times.` : ""}`;
  return base + (openDisputes ? ` ${openDisputes} open dispute${openDisputes > 1 ? "s" : ""}.` : "");
}

export const BOOKING_GROUPS = [["n", "Overview"], ["w", "Who and where"], ["d", "Delivery"]];
export const BOOKING_DEFAULTS = ["b_now", "b_status", "b_adv", "b_game", "b_new", "b_imp"];

const imp = (n) => n.toLocaleString("en-US").replace(/,/g, " ");

/** The widgets of the board over `rows` (every booking). */
export function bookingWidgets(rows) {
  const live = rows.filter((r) => r.state === "running" || r.state === "scheduled");
  const withImp = rows.filter((r) => r.impressions != null);
  const byGame = new Map();
  for (const r of withImp) byGame.set(r.game, (byGame.get(r.game) ?? 0) + r.impressions);
  const paused = rows.filter((r) => r.state === "paused");
  const known = rows.filter((r) => r.state !== "waiting" && r.state !== "rejected" && r.state !== "cancelled");
  return [
    { k: "b_now", g: "n", t: "Bookings now", w: 6, info: "How many bookings are in each state right now.", data: stats([["Running", rows.filter((r) => r.state === "running").length], ["Paused", paused.length, paused.length > 0], ["Scheduled", rows.filter((r) => r.state === "scheduled").length], ["Ended", rows.filter((r) => r.state === "ended").length]]) },
    { k: "b_status", g: "n", t: "By status", w: 4, info: "Share of all bookings by state. Paused means a developer or an admin switched the booking off in the game.", data: ring([["Running", rows.filter((r) => r.state === "running").length, GREEN], ["Paused", paused.length, AMBER], ["Scheduled", rows.filter((r) => r.state === "scheduled" || r.state === "waiting").length, BLUE], ["Ended", rows.filter((r) => r.state === "ended").length, GREY]], "bookings") },
    { k: "b_new", g: "n", t: "New bookings per week", w: 8, info: "Bookings made in each of the last 13 weeks.", data: cols(weekly(rows, (r) => r.age)) },
    { k: "b_adv", g: "w", t: "Advertisers with most bookings", w: 6, info: "Advertisers ranked by number of bookings.", data: bars(countBy(rows, (r) => r.advertiser).slice(0, 5), ORANGE) },
    { k: "b_pair", g: "w", t: "Biggest advertiser–developer pairs", w: 6, info: "Pairs with the most bookings between them. These are the groups in the table.", data: bars(countBy(rows, (r) => `${r.advertiser} → ${r.developer}`).slice(0, 5), PLUM) },
    { k: "b_dev", g: "w", t: "Developers with most bookings", w: 6, info: "Developers ranked by bookings placed in their games.", data: bars(countBy(rows, (r) => r.developer).slice(0, 5), BLUE) },
    { k: "b_game", g: "w", t: "Busiest games", w: 6, info: "Games with the most bookings.", data: bars(countBy(rows, (r) => r.game).slice(0, 5), BLUE) },
    { k: "b_cat", g: "w", t: "Categories on air", w: 6, info: "Categories of bookings that are running or scheduled.", data: bars(countBy(live, (r) => r.categoryLabel).slice(0, 6), ORANGE, "Nothing is running.") },
    { k: "b_imp", g: "d", t: "Impressions by game", w: 6, info: "Impressions delivered by the bookings, by game.", data: withImp.length ? bars([...byGame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, v, imp(v)]), ORANGE) : { type: "note", text: "Impression counts are not available yet." } },
    { k: "b_paused", g: "d", t: "Who pauses most", w: 6, info: "Developers with the most paused or blocked bookings in their games. Many pauses can mean the ads do not suit the game.", data: bars(countBy(paused, (r) => r.developer).slice(0, 5), AMBER, "No paused bookings.") },
    { k: "b_length", g: "d", t: "Booking length", w: 6, info: "How long bookings are planned for. Open end means no end date.", data: bars([["Up to 2 weeks", known.filter((r) => r.durationDays > 0 && r.durationDays <= 14).length], ["2 to 4 weeks", known.filter((r) => r.durationDays > 14 && r.durationDays <= 31).length], ["1 to 3 months", known.filter((r) => r.durationDays > 31).length], ["Open end", known.filter((r) => r.durationDays === 0).length]], GREY) },
  ];
}

export { impKey, RED };
