// All bookings: what state a booking is in, groups for the table, the history on a booking's card and the figures for
// the board. Pure (no React, no database), so test/admin-bookings.test.mjs can run it.
import { categoryLabel } from "./categories.js";
import { fdt, spaced, shortId } from "./admin-format.js";
import { countBy, weekly, bars, ring, stats, cols, GREEN, AMBER, BLUE, GREY, RED, ORANGE, PLUM } from "./admin-stats.js";

const DAY = 864e5;
const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

export const STATES = {
  running: { label: "Running", short: "Running", tone: "good", rank: 1 },
  paused: { label: "Paused by developer", short: "Paused", tone: "warn", rank: 0 },
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
      startAge: Math.max(0, Math.floor((now - Date.parse(b.startsOn ?? b.created)) / DAY)),
      durationDays: b.endsOn ? Math.round((Date.parse(b.endsOn) - Date.parse(b.startsOn ?? b.created)) / DAY) + 1 : 0,
      progress: state === "scheduled" || state === "waiting" ? 0 : periodProgress({ startsOn: b.startsOn, endsOn: b.endsOn, created: b.created }, today),
      impressions: impressions ? impressions.get(impKey(b.placementId, b.creativeId)) ?? 0 : null,
      held: b.controlNote || "",
      adminPaused: adminPaused.has(b.id),
      period: `${String(b.startsOn ?? b.created).slice(5)} → ${b.endsOn ? String(b.endsOn).slice(5) : "no end"}`,
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

/** "Paused by developer" / "Paused by admin" for a paused booking; the plain label for the others. */
export const stateLabel = (row) => (row.state === "paused" && row.adminPaused ? "Paused by admin" : STATES[row.state].label);

const OUTCOME = (d) => (d.status === "open" ? "Still open" : d.outcome === "removed" ? "Creative removed · bookings unchanged · developer notified" : d.outcome === "paused" ? "Booking paused · creative stays · both sides notified" : d.initiator === "advertiser" ? "Dismissed · both sides notified" : "Dismissed · developer notified");

/**
 * The history of a booking, oldest first (the mockup's bkEvents): [{ kind, who, text, when, at, facts: [[label, value, link?]] }].
 * `disputes` are rows with `initiator`, `byName`; `ctx` = { advEmail, devEmail }.
 */
export function bookingEvents(b, disputes = [], ctx = {}) {
  const ev = [];
  const size = b.creativeSize && b.creativeSize !== "—" ? ` · ${b.creativeSize}` : "";
  ev.push({ kind: "adv", who: b.advertiser, text: `Booked "${b.placement}" in ${b.game}`, at: b.createdAt, when: fdt(b.createdAt), facts: [["Campaign", b.campaign], ["Creative", `${b.creative}${size}`], ["Placement", `${b.placement} · ${b.game}`], ["Period", b.period], ["Booked by", `${b.advertiser}${ctx.advEmail ? ` · ${ctx.advEmail}` : ""}`]] });
  if (b.decidedAt && b.state !== "rejected" && b.state !== "waiting" && b.state !== "cancelled") ev.push({ kind: "ok", who: "System", text: "Approved automatically", at: b.decidedAt, when: fdt(b.decidedAt), facts: [["Creative", "Approved by review"], ["Fit with the game", "Category and audience match"], ["Rule", "Bookings approve themselves"]] });
  if (b.state === "rejected") ev.push({ kind: "bad", who: "System", text: "Rejected", at: b.decidedAt, when: fdt(b.decidedAt), facts: [["Reason", b.note || "No reason given"]] });
  if (b.state === "cancelled") ev.push({ kind: "bad", who: "System", text: "Cancelled", at: b.decidedAt, when: fdt(b.decidedAt), facts: [["Reason", b.note || "Withdrawn by the advertiser"]] });
  if (b.startedAt) ev.push({ kind: "ok", who: "System", text: "Started showing", at: b.startedAt, when: fdt(b.startedAt), facts: [["First impression", fdt(b.startedAt)], ["So far", b.impressions != null ? `${spaced(b.impressions)} impressions` : "—"]] });
  else if (b.state === "scheduled") ev.push({ kind: "sys", who: "System", text: `Starts showing on ${fdt(b.from)}`, at: null, when: "planned", facts: [["Starts", fdt(b.from)], ["Ends", b.to ? fdt(b.to) : "No end date"]] });
  if (b.state === "paused") {
    ev.push(b.adminPaused
      ? { kind: "admin", who: "DeusADS admin", text: "Paused the booking", at: null, when: "", facts: [["Paused by", "DeusADS admin"], ["Effect", "Nothing is shown until an admin resumes it"], ["Impressions so far", b.impressions != null ? spaced(b.impressions) : "—"]] }
      : { kind: "dev", who: b.developer, text: "Paused the booking in the game", at: null, when: "", facts: [["Paused by", b.developer], ["Effect", b.held || "Nothing is shown until the developer resumes"], ["Impressions so far", b.impressions != null ? spaced(b.impressions) : "—"]] });
  }
  if (b.state === "ended") ev.push({ kind: "sys", who: "System", text: "Ended", at: b.to ? `${b.to}T23:59:59Z` : null, when: b.to ? fdt(b.to) : "", facts: [["Reason", "Planned end date reached"], ["Final", b.impressions != null ? `Shown ${spaced(b.impressions)} times` : "—"]] });
  for (const d of disputes) {
    const adv = d.initiator === "advertiser";
    ev.push({ kind: adv ? "adv" : "report", who: d.byName, text: `Dispute #${shortId(d.id)} opened: ${d.reason}`, at: d.created_at, when: fdt(d.created_at), facts: [["Opened by", `${adv ? "Advertiser" : "Developer"} ${d.byName}`], ["Reason", d.reason], ["Outcome", OUTCOME(d)], ["Dispute", `Open dispute #${shortId(d.id)}`, { card: "dispute", id: d.id }]] });
  }
  return ev.map((e, i) => ({ ...e, i })).sort((a, c) => (a.at ? Date.parse(a.at) : Infinity) - (c.at ? Date.parse(c.at) : Infinity) || a.i - c.i).map(({ i, ...e }) => e);
}

/** "Now:" line of a booking card (the mockup's bkNow). */
export function bookingNow(b, openDisputes = 0) {
  const n = b.impressions != null ? spaced(b.impressions) : null;
  const base =
    b.state === "running" ? `Running.${n ? ` ${n} impressions so far` : ""}${b.progress != null ? `${n ? "," : ""} ${b.progress}% of the period.` : "."}`
    : b.state === "paused" ? (b.adminPaused ? "Paused by an admin. Nothing is shown in the game." : "Paused by the developer. Nothing is shown in the game.")
    : b.state === "scheduled" ? `Scheduled. Starts on ${fdt(b.from)}.`
    : b.state === "waiting" ? "Waiting for the creative to be approved."
    : b.state === "rejected" ? `Rejected${b.note ? `: ${b.note}` : "."}`
    : b.state === "cancelled" ? "Cancelled."
    : `Ended${b.to ? ` on ${fdt(b.to)}` : ""}.${n ? ` Shown ${n} times.` : ""}`;
  return base + (openDisputes ? ` ${openDisputes} open dispute${openDisputes > 1 ? "s" : ""}.` : "");
}

export const BOOKING_GROUPS = [["n", "Overview"], ["w", "Who and where"], ["d", "Delivery"]];
export const BOOKING_DEFAULTS = ["bstat", "bstatus", "badv", "bgame", "bnew", "bimp"];

const imp = (n) => n.toLocaleString("en-US").replace(/,/g, " ");

/** The widgets of the board over `rows` (every booking): the mockup's BW catalog. */
export function bookingWidgets(rows) {
  const live = rows.filter((r) => r.state === "running" || r.state === "scheduled");
  const withImp = rows.filter((r) => r.impressions != null);
  const byGame = new Map();
  for (const r of withImp) byGame.set(r.game, (byGame.get(r.game) ?? 0) + r.impressions);
  const paused = rows.filter((r) => r.state === "paused");
  const known = rows.filter((r) => r.state !== "waiting" && r.state !== "rejected" && r.state !== "cancelled");
  const n = (state) => rows.filter((r) => r.state === state).length;
  return [
    { k: "bstat", g: "n", t: "Bookings now", w: 6, info: "How many bookings are in each state right now.", data: stats([["Running", n("running")], ["Paused", paused.length], ["Scheduled", n("scheduled")], ["Ended", n("ended")]]) },
    { k: "bstatus", g: "n", t: "By status", w: 4, info: "Share of all bookings by state. Paused means a developer switched the booking off in their game.", data: ring([["Running", n("running"), GREEN], ["Paused", paused.length, AMBER], ["Scheduled", n("scheduled") + n("waiting"), BLUE], ["Ended", n("ended"), GREY]], "bookings") },
    { k: "bnew", g: "n", t: "New bookings per week", w: 8, info: "Bookings that started in each of the last 13 weeks.", data: cols(weekly(rows, (r) => r.startAge ?? r.age)) },
    { k: "badv", g: "w", t: "Advertisers with most bookings", w: 6, info: "Advertisers ranked by number of bookings.", data: bars(countBy(rows, (r) => r.advertiser).slice(0, 5), ORANGE) },
    { k: "bpair", g: "w", t: "Biggest advertiser–developer pairs", w: 6, info: "Pairs with the most bookings between them. These are the groups in the table.", data: bars(countBy(rows, (r) => `${r.advertiser} → ${r.developer}`).slice(0, 5), PLUM) },
    { k: "bdev", g: "w", t: "Developers with most bookings", w: 6, info: "Developers ranked by bookings placed in their games.", data: bars(countBy(rows, (r) => r.developer).slice(0, 5), BLUE) },
    { k: "bgame", g: "w", t: "Busiest games", w: 6, info: "Games with the most bookings.", data: bars(countBy(rows, (r) => r.game).slice(0, 5), BLUE) },
    { k: "bcat", g: "w", t: "Categories on air", w: 6, info: "Categories of bookings that are running or scheduled.", data: bars(countBy(live, (r) => r.categoryLabel).slice(0, 6), ORANGE, "Nothing is running.") },
    { k: "bimp", g: "d", t: "Impressions by game", w: 6, info: "Impressions delivered, by game, across all bookings.", data: withImp.length ? bars([...byGame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, v, imp(v)]), ORANGE) : { type: "note", text: "Impression counts are not available yet." } },
    { k: "bpaused", g: "d", t: "Who pauses most", w: 6, info: "Developers who paused the most bookings in their games. Many pauses can mean the ads do not suit the game.", data: bars(countBy(paused, (r) => r.developer).slice(0, 5), AMBER, "No paused bookings.") },
    { k: "bdur", g: "d", t: "Booking length", w: 6, info: "How long bookings are planned for. Open end means no end date.", data: bars([["Up to 2 weeks", known.filter((r) => r.durationDays > 0 && r.durationDays <= 14).length], ["2 to 4 weeks", known.filter((r) => r.durationDays > 14 && r.durationDays <= 31).length], ["1 to 3 months", known.filter((r) => r.durationDays > 31).length], ["Open end", known.filter((r) => r.durationDays === 0).length]], GREY) },
  ];
}

export { impKey, RED };
