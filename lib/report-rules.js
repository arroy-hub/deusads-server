// How a report about a creative ends, and what each side reads. Pure (no React, no database).
//
// A developer's report asks DeusADS to check a creative against the platform rules for every game. Blocking in one's own
// game is a separate right and never needs a decision. Three decisions:
//   dismiss  no violation: the creative keeps running; the advertiser is not told, the report only counts
//   change   an easy fix: the creative stops showing everywhere until a new version is approved
//   remove   a clear violation: the creative is blocked on the platform for good
// (An advertiser's report is about a booking and ends with `pause` or `dismiss`, as before.)

export const DECISIONS = ["dismiss", "change", "remove", "pause"];
export const OUTCOME_OF = { dismiss: "dismissed", change: "changes", remove: "removed", pause: "paused" };
export const needsRule = (decision) => decision === "change" || decision === "remove";

/** What the admin reads: [label, tone]. */
export const ADMIN_OUTCOME = { dismissed: ["No violation", "good"], changes: ["Change requested", "warn"], removed: ["Blocked", "bad"], paused: ["Paused", "bad"] };

/** What happens, said to the admin before deciding. */
export const EFFECT = {
  dismiss: "The developer reads “No violation found”. The creative keeps running; whether it shows in that game stays the developer’s choice. The advertiser is not told about the report, it only adds to the creative’s count of reports.",
  change: "The creative stops showing in every game until the advertiser uploads a new version and it is approved. The advertiser reads the rule and your message; the developer reads “Change requested”.",
  remove: "The creative is blocked on the platform for good. The advertiser reads which rule it breaks and your message; the developer reads “Creative removed”.",
};

/** What the developer who reported reads: { key, label, tone, text }. `status` is open or an outcome. */
export function developerOutcome(status) {
  if (status === "open") return { key: "open", label: "In review", tone: "wait", text: "DeusADS is reviewing it. The creative keeps running in the meantime, unless you block it in your game." };
  if (status === "changes") return { key: "changes", label: "Change requested", tone: "wait", text: "DeusADS asked the advertiser to change this creative. It is not shown in any game until a new version is approved; an approved new version comes back as a new picture." };
  if (status === "removed") return { key: "removed", label: "Creative removed", tone: "bad", text: "DeusADS blocked this creative on the platform: it breaks the platform rules. It is not shown in any game." };
  if (status === "paused") return { key: "paused", label: "Booking paused", tone: "bad", text: "DeusADS paused the booking." };
  return { key: "dismissed", label: "No violation found", tone: "off", text: "DeusADS checked this creative against the platform rules and found no violation, so it keeps running on the platform. Whether it shows in your game is up to you." };
}

/** The reason an advertiser reads for a block that was made together with a report, while it is reviewed and after. */
export const PENDING_BLOCK_REASON = "Blocked pending a DeusADS review";
export const NEUTRAL_BLOCK_REASON = "Blocked by the developer";

/**
 * May this picture be reported again? Not while a report is open, and not after a decision, until the picture changes:
 * `changedAt` is when the creative was last reviewed or this shape's picture last uploaded.
 */
export function mayReport(last, changedAt) {
  if (!last) return true;
  if (last.status === "open") return false;
  const decided = Date.parse(last.resolvedAt ?? "");
  const changed = Date.parse(changedAt ?? "");
  return Number.isFinite(decided) && Number.isFinite(changed) && changed > decided;
}

/** The signal turns into a piece of advice once: blocked in at least 3 games and in a fifth of the games it runs in. */
export const SIGNAL_MIN_GAMES = 3;
export const SIGNAL_SHARE = 0.2;
export const signalIsLoud = ({ blocked, games }) => blocked >= SIGNAL_MIN_GAMES && games > 0 && blocked / games >= SIGNAL_SHARE;

/**
 * How developers react to a creative, for its advertiser: { games, blocked, reports, clean, reasons: [[reason, count]] }.
 * `games` are the ids of the games it is booked in, `blocks` rows of { gameId, reason } (one per game counts), `reports`
 * rows of { status } from developers.
 */
export function creativeSignal({ games = [], blocks = [], reports = [] }) {
  const inGames = new Set(games);
  const byGame = new Map();
  for (const block of blocks) if (block?.gameId && !byGame.has(block.gameId)) byGame.set(block.gameId, block.reason || "No reason given");
  for (const id of byGame.keys()) inGames.add(id);
  const counts = new Map();
  for (const reason of byGame.values()) {
    const shown = reason === PENDING_BLOCK_REASON ? NEUTRAL_BLOCK_REASON : reason;
    counts.set(shown, (counts.get(shown) ?? 0) + 1);
  }
  return {
    games: inGames.size,
    blocked: byGame.size,
    reports: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    clean: reports.filter((r) => r.status === "dismissed").length,
    reasons: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

/** The line under a creative's name: "Blocked in 6 of 21 games · 2 reports, no violation found". Empty when there is nothing to say. */
export function signalLine(signal) {
  if (!signal || (signal.blocked === 0 && signal.reports === 0)) return "";
  const parts = [];
  if (signal.blocked > 0) parts.push(`Blocked in ${signal.blocked} of ${signal.games} ${signal.games === 1 ? "game" : "games"}`);
  if (signal.reports > 0) {
    const count = `${signal.reports} ${signal.reports === 1 ? "report" : "reports"}`;
    parts.push(signal.clean === signal.reports ? `${count}, no violation found` : signal.open > 0 ? `${count}, ${signal.open} in review` : count);
  }
  return parts.join(" · ");
}

/** What an advertiser reads about a creative that DeusADS holds: null when it is not held. */
export function holdOf(creative) {
  const hold = creative?.hold;
  if (hold !== "changes" && hold !== "blocked") return null;
  const sent = hold === "changes" && creative.status === "pending";
  return {
    kind: hold,
    sent,
    pill: hold === "blocked" ? ["Blocked", "ov-bad"] : sent ? ["In review", "ov-scheduled"] : ["Needs changes", "ov-warn"],
    line: hold === "blocked" ? "Blocked for a violation: not shown anywhere" : sent ? "The new version is in review. It runs again once it is approved" : "Not shown in any game until a new version is approved",
    toggle: hold === "blocked" ? "Why it was blocked" : "What to change",
    rule: creative.hold_rule ?? "",
    note: creative.hold_note ?? "",
    at: creative.hold_at ?? null,
  };
}
