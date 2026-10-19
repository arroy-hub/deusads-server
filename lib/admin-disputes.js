// Disputes both ways: rows, the history of one dispute and the figures for the board. Pure (no React, no database).
import { categoryLabel } from "./categories.js";
import { countBy, median, weekly, hours, bars, ring, stats, cols, RED, ORANGE, AMBER, GREEN, BLUE, GREY } from "./admin-stats.js";

const DAY = 864e5;
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");

export const OUTCOMES = { removed: "Creative removed", paused: "Booking paused", dismissed: "Dismissed" };
export const outcomeOf = (d) => (d.status === "open" ? "open" : d.outcome ?? "dismissed");

/**
 * Rows from creative_disputes (`initiator` developer | advertiser) with names filled in by the caller:
 * `byName` (who reported), `againstName` (who is reported), `gameName`, `creativeName`, `creativeUrl`, `category`.
 */
export function disputeRows(list, now = Date.now()) {
  return list.map((d) => {
    const initiator = d.initiator === "advertiser" ? "advertiser" : "developer";
    const created = Date.parse(d.created_at);
    const resolved = d.resolved_at ? Date.parse(d.resolved_at) : null;
    return {
      id: d.id,
      initiator,
      by: d.byName,
      byId: initiator === "advertiser" ? d.advertiser_id : d.developer_id,
      against: d.againstName,
      againstId: initiator === "advertiser" ? d.developer_id : d.advertiser_id,
      game: d.gameName,
      gameId: d.game_id,
      creative: d.creativeName,
      creativeId: d.creative_id,
      creativeUrl: d.creativeUrl ?? "",
      bookingId: d.booking_id ?? null,
      category: d.category ?? "other",
      categoryLabel: categoryLabel(d.category ?? "other"),
      reason: d.reason,
      comment: d.comment ?? "",
      adminNote: d.admin_note ?? "",
      status: outcomeOf(d), // open | removed | paused | dismissed
      open: d.status === "open",
      created: day(d.created_at),
      createdAt: d.created_at,
      resolvedAt: d.resolved_at ?? null,
      age: Math.max(0, Math.floor((now - created) / DAY)),
      hours: resolved ? Math.max(0, (resolved - created) / 36e5) : null,
      waitingHours: resolved ? null : Math.max(0, (now - created) / 36e5),
    };
  });
}

/** The history of one dispute, oldest first: [{ kind, who, text, at, facts }]. `replies` are dispute_events of kind "reply". */
export function disputeEvents(r, replies = []) {
  const ev = [{ kind: "report", who: r.by, text: `Opened a dispute: ${r.reason}`, at: r.createdAt, facts: [["From", r.initiator === "advertiser" ? "Advertiser" : "Developer"], ["About", `${r.creative} in ${r.game}`], ["Comment", r.comment || "No comment"]] }];
  for (const x of replies) ev.push({ kind: x.side === "admin" ? "ok" : x.side === "advertiser" ? "adv" : "dev", who: x.who, text: x.text, at: x.created_at, facts: [] });
  if (r.open) ev.push({ kind: "sys", who: "System", text: "Waiting for an admin", at: null, facts: [["Waiting", `${r.age} day${r.age === 1 ? "" : "s"}`]] });
  else ev.push({ kind: r.status === "dismissed" ? "sys" : "bad", who: "Admin", text: OUTCOMES[r.status], at: r.resolvedAt, facts: [["Decision", OUTCOMES[r.status]], ["Note", r.adminNote || "No note"], ["Told", "Both sides"]] });
  return ev.sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity));
}

export const DISPUTE_GROUPS = [["w", "Who"], ["d", "Decisions"], ["t", "Trends"]];
export const DISPUTE_DEFAULTS = ["d_open", "d_from", "d_out", "d_week"];

export function disputeWidgets(rows) {
  const open = rows.filter((r) => r.open);
  const done = rows.filter((r) => !r.open);
  const hrs = done.map((r) => r.hours).filter((h) => h != null);
  const decided = (o) => done.filter((r) => r.status === o).length;
  return [
    { k: "d_open", g: "d", t: "Waiting for a decision", w: 6, info: "Open disputes and how long the oldest has waited.", data: stats([["Open", open.length, open.length > 0], ["Oldest", open.length ? `${Math.max(...open.map((r) => r.age))} d` : "—"], ["Median answer", hours(median(hrs))]]) },
    { k: "d_from", g: "w", t: "Who reports", w: 4, info: "Disputes opened by developers and by advertisers.", data: ring([["Developers", rows.filter((r) => r.initiator === "developer").length, BLUE], ["Advertisers", rows.filter((r) => r.initiator === "advertiser").length, ORANGE]], "disputes") },
    { k: "d_out", g: "d", t: "Decisions", w: 4, info: "What was decided on settled disputes.", data: ring([["Removed", decided("removed"), RED], ["Paused", decided("paused"), AMBER], ["Dismissed", decided("dismissed"), GREEN]], "settled") },
    { k: "d_rep", g: "w", t: "Who reports most", w: 6, info: "Accounts that opened the most disputes. Many dismissed ones can mean the account reports out of habit.", data: bars(countBy(rows, (r) => r.by).slice(0, 5), BLUE) },
    { k: "d_against", g: "w", t: "Who is reported most", w: 6, info: "Accounts that others report the most.", data: bars(countBy(rows, (r) => r.against).slice(0, 5), RED) },
    { k: "d_game", g: "w", t: "Games with most disputes", w: 6, info: "Games that appear in the most disputes.", data: bars(countBy(rows, (r) => r.game).slice(0, 5), BLUE) },
    { k: "d_reason", g: "d", t: "Common reasons", w: 6, info: "The reasons given most often.", data: bars(countBy(rows, (r) => r.reason).slice(0, 5), ORANGE) },
    { k: "d_cat", g: "d", t: "Categories reported", w: 6, info: "Categories of the creatives reported.", data: bars(countBy(rows, (r) => r.categoryLabel).slice(0, 5), ORANGE) },
    { k: "d_week", g: "t", t: "Disputes per week", w: 8, info: "Disputes opened in each of the last 13 weeks.", data: cols(weekly(rows, (r) => r.age)) },
    { k: "d_speed", g: "t", t: "How fast we answer", w: 6, info: "Median time from opening to a decision, and how many settled disputes ended in an action.", data: stats([["Median", hours(median(hrs))], ["Slowest", hours(hrs.length ? Math.max(...hrs) : null)], ["Acted on", done.length ? `${Math.round(((decided("removed") + decided("paused")) / done.length) * 100)}%` : "—"]]) },
  ];
}
