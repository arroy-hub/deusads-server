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
  change: "The reported picture stops showing in every game until the advertiser uploads a new one for that shape and it is approved; the creative’s other shapes keep running. The advertiser reads the rule and your message; the developer reads “Change requested”.",
  remove: "The reported picture is blocked on the platform for good; the creative’s other shapes keep running. The advertiser reads which rule it breaks and your message; the developer reads “Picture removed”.",
};

/** What the developer who reported reads: { key, label, tone, text }. `status` is open or an outcome. */
export function developerOutcome(status) {
  if (status === "open") return { key: "open", label: "In review", tone: "wait", text: "DeusADS is reviewing it. The creative keeps running in the meantime, unless you block it in your game." };
  if (status === "changes") return { key: "changes", label: "Change requested", tone: "wait", text: "DeusADS asked the advertiser to change this picture. It is not shown in any game until a new one is approved; an approved new picture comes back to your game as new." };
  if (status === "removed") return { key: "removed", label: "Picture removed", tone: "bad", text: "DeusADS blocked this picture on the platform: it breaks the platform rules. It is not shown in any game." };
  if (status === "paused") return { key: "paused", label: "Booking paused", tone: "bad", text: "DeusADS paused the booking." };
  return { key: "dismissed", label: "No violation found", tone: "off", text: "DeusADS checked this creative against the platform rules and found no violation, so it keeps running on the platform. Whether it shows in your game is up to you." };
}

/**
 * What happened to a report after DeusADS decided, as the developer who sent it follows it. `events` are the dispute's
 * decision events, oldest first: { text, at }. Returns the steps in order, each { key, at }:
 *   asked     DeusADS asked the advertiser to change the picture
 *   removed   DeusADS blocked the picture
 *   uploaded  the advertiser uploaded a new picture; DeusADS reviews it
 *   declined  DeusADS did not approve the new picture; the advertiser has to send another
 *   replaced  DeusADS approved the new picture; it runs again
 *   withdrawn DeusADS took its decision back
 * What the advertiser and DeusADS wrote to each other is not part of it.
 */
export function reportSteps(events) {
  const steps = [];
  for (const event of events ?? []) {
    const text = String(event?.text ?? "");
    const key = text.startsWith("changes") ? "asked"
      : text.startsWith("removed") ? "removed"
      : text.startsWith("picture: uploaded") ? "uploaded"
      : text.startsWith("picture: rejected") ? "declined"
      : text.startsWith("picture: approved") ? "replaced"
      : text.startsWith("withdrawn") ? "withdrawn"
      : null;
    if (key) steps.push({ key, at: event.at ?? null });
  }
  return steps;
}

/** What each step says to the developer: [title, text]. */
export const STEP_TEXT = {
  asked: ["DeusADS asked the advertiser to change it", "The picture is not shown in any game until a new one is approved."],
  removed: ["DeusADS removed the picture", "It breaks the platform rules and is not shown in any game."],
  uploaded: ["The advertiser uploaded a new picture", "DeusADS is reviewing it. Nothing is shown in this shape until it is approved."],
  declined: ["DeusADS did not approve the new picture", "The advertiser has to send another one. Nothing is shown in this shape meanwhile."],
  replaced: ["The picture was replaced", "DeusADS approved the advertiser’s new picture. It runs again on the platform."],
  withdrawn: ["DeusADS took its decision back", "No violation was found after a second look. The picture runs again on the platform."],
};

/**
 * Where a report stands now for the developer, once its later steps are known: { key, label, tone, text }.
 * Without later steps this is developerOutcome(status).
 */
export function developerStage(status, steps = []) {
  const base = developerOutcome(status);
  const last = steps[steps.length - 1]?.key;
  if (status === "changes" && last === "uploaded") return { key: "uploaded", label: "New picture in review", tone: "wait", text: "The advertiser uploaded a new picture after your report. DeusADS is reviewing it; nothing is shown in this shape until it is approved." };
  if (status === "changes" && last === "declined") return { key: "declined", label: "Waiting for the advertiser", tone: "wait", text: "DeusADS did not approve the advertiser’s new picture. The advertiser has to send another one; nothing is shown in this shape meanwhile." };
  if (status === "changes" && last === "replaced") return { key: "replaced", label: "Picture replaced", tone: "active", text: "The advertiser replaced the picture and DeusADS approved the new one. It runs again on the platform. Whether it shows in your game is up to you." };
  return base;
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
    pill: hold === "blocked" ? ["Blocked", "ov-bad"] : sent ? ["In review", "ov-scheduled"] : ["Needs changes", "ov-act"],
    line: hold === "blocked" ? "Blocked for a violation: not shown anywhere" : sent ? "The new version is in review. It runs again once it is approved" : "Not shown in any game until a new version is approved",
    toggle: hold === "blocked" ? "Why it was blocked" : "What to change",
    rule: creative.hold_rule ?? "",
    note: creative.hold_note ?? "",
    at: creative.hold_at ?? null,
  };
}

/**
 * A hold on one picture (a creative in one shape, migration 0065), as the advertiser reads it: the same fields as
 * holdOf(), plus the shape. `row` is a creative_picture_holds row, `label` the shape's name ("16:9").
 */
export function pictureHoldOf(row, label) {
  if (!row || (row.kind !== "changes" && row.kind !== "blocked")) return null;
  const sent = row.kind === "changes" && Boolean(row.sent_at);
  const what = label ? `${label} picture` : "picture";
  return {
    kind: row.kind,
    sent,
    shape: row.shape,
    shapeLabel: label ?? "",
    disputeId: row.dispute_id ?? null,
    pill: row.kind === "blocked" ? [label ? `${label} blocked` : "Blocked", "ov-bad"] : sent ? [label ? `${label} in review` : "In review", "ov-scheduled"] : [label ? `${label} needs changes` : "Needs changes", "ov-act"],
    line: row.kind === "blocked" ? `Its ${what} is blocked for a violation. Other shapes keep running` : sent ? `The new ${what} is in review. Other shapes keep running` : `Its ${what} is not shown until a new one is approved. Other shapes keep running`,
    toggle: row.kind === "blocked" ? "Why it was blocked" : "What to change",
    rule: row.rule ?? "",
    note: row.note ?? "",
    at: row.held_at ?? null,
  };
}
