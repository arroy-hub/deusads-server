// Rules for pausing and blocking ads in one game (migration 0023). Pure, so they can be tested:
// no React, no database. The Campaigns tab, its server actions and the manifest all use these.

import { AD_CATEGORIES } from "./categories.js";

/** A single item may change state this many times per hour; a repeated bulk change likewise. */
export const CHANGE_LIMIT = 2;
export const WINDOW_MS = 60 * 60 * 1000;

export const ACTIONS = ["pause", "resume", "block", "unblock"];
export const SCOPES = ["campaign", "creative", "advertiser"];

const key = (scope, id) => `${scope}:${id}`;

/** Controls (rows of game_ad_controls) as a lookup: key("campaign", id) -> { state, reason, comment }. */
export function controlMap(rows) {
  const map = new Map();
  for (const row of rows ?? []) map.set(key(row.scope, row.target_id), { state: row.state, reason: row.reason ?? "", comment: row.comment ?? "" });
  return map;
}

/**
 * Ad categories blocked in a game: the explicit rows win, a category with no row follows its default
 * (the restricted ones are blocked). Returns a Set of category ids.
 */
export function blockedCategories(rows) {
  const explicit = new Map((rows ?? []).map((row) => [row.category, Boolean(row.blocked)]));
  return new Set(AD_CATEGORIES.filter((category) => (explicit.has(category.id) ? explicit.get(category.id) : category.restricted)).map((category) => category.id));
}

/**
 * What a campaign is in a game, taking every control into account. The advertiser's block comes first,
 * then the campaign's own, then the category.
 * `base` is where the campaign stands without any control: "active", "ended" or "waiting".
 * Returns { key: "active"|"paused"|"blocked"|"blockedcat"|"blockedadv"|"ended"|"waiting", reason, comment }.
 */
export function campaignState({ campaignId, advertiserId, category, base }, { controls, blocked }) {
  const adv = controls.get(key("advertiser", advertiserId));
  if (adv?.state === "blocked") return { key: "blockedadv", reason: adv.reason, comment: adv.comment };
  const own = controls.get(key("campaign", campaignId));
  if (own?.state === "blocked") return { key: "blocked", reason: own.reason, comment: own.comment };
  if (blocked.has(category)) return { key: "blockedcat", reason: "", comment: "" };
  if (own?.state === "paused") return { key: "paused", reason: own.reason, comment: own.comment };
  return { key: base, reason: "", comment: "" };
}

/** True when a creative of a booking may be shown in the game. The developer's own pictures always may. */
export function mayServe({ source, campaignId, advertiserId, creativeId, category }, { controls, blocked }) {
  if (source !== "booking") return true;
  if (controls.get(key("advertiser", advertiserId))?.state === "blocked") return false;
  const own = controls.get(key("campaign", campaignId));
  if (own) return false; // paused or blocked
  if (controls.get(key("creative", creativeId))?.state === "blocked") return false;
  if (category && blocked.has(category)) return false;
  return true;
}

/** The state an item has to be in for an action to do something. */
const NEEDS = { pause: "free", resume: "paused", block: "notblocked", unblock: "blocked" };

function stateMatches(action, state) {
  const need = NEEDS[action];
  if (need === "free") return state === "free";
  if (need === "notblocked") return state !== "blocked";
  return state === need;
}

/** A name for "the same bulk change": same action, scope and set of targets. */
export function bulkKeyOf(action, scope, ids) {
  return `${action}:${scope}:${[...new Set(ids)].sort().join(",")}`;
}

/**
 * Decides what a change does. Nothing here touches the database.
 *   action   one of ACTIONS; scope one of SCOPES
 *   targets  [{ id, state }] with state "free", "paused" or "blocked" (what each is now)
 *   recent   the log of the last hour for these targets: [{ target_id, batch_id, bulk_key, created_at }]
 *   now      a Date (or milliseconds)
 * Returns { apply, duplicates, limited, bulkLimited, bulk }:
 *   duplicates   already in the state the action asks for; these are not saved again
 *   limited      changed too often this hour (an item may change CHANGE_LIMIT times per hour)
 *   bulkLimited  the same bulk change was already made CHANGE_LIMIT times this hour: nothing is applied
 *   bulk         more than one target, which is saved as one record rather than one per item
 */
export function planChange({ action, scope, targets, recent = [], now = Date.now() }) {
  const since = Number(now) - WINDOW_MS;
  const inWindow = recent.filter((row) => new Date(row.created_at).getTime() > since);
  const ids = targets.map((target) => target.id);
  const bulk = ids.length > 1;

  const duplicates = [];
  const limited = [];
  const apply = [];
  for (const target of targets) {
    if (!stateMatches(action, target.state)) {
      duplicates.push(target.id);
      continue;
    }
    // One item's own changes: those made on their own, not as part of a bulk change.
    const own = inWindow.filter((row) => row.target_id === target.id && !row.batch_id).length;
    if (own >= CHANGE_LIMIT) limited.push(target.id);
    else apply.push(target.id);
  }

  let bulkLimited = false;
  if (bulk && apply.length) {
    const same = bulkKeyOf(action, scope, ids);
    const times = new Set(inWindow.filter((row) => row.bulk_key === same && row.batch_id).map((row) => row.batch_id)).size;
    if (times >= CHANGE_LIMIT) bulkLimited = true;
  }
  return { apply: bulkLimited ? [] : apply, duplicates, limited, bulkLimited, bulk };
}

/** The new control for an action, or null when the control row is to be removed. */
export function nextControl(action) {
  if (action === "pause") return { state: "paused" };
  if (action === "block") return { state: "blocked" };
  return null; // resume and unblock remove the control
}

const WORD = { campaign: ["campaign", "campaigns"], creative: ["creative", "creatives"], advertiser: ["advertiser", "advertisers"] };
const noun = (scope, n) => WORD[scope][n === 1 ? 0 : 1];

/**
 * The sentence shown next to what was changed. `names` is the list of names changed.
 * Says what was skipped and why, in the order that matters: nothing changed, too often, already so.
 */
export function changeMessage({ action, scope, applied, duplicates = 0, limited = 0, bulkLimited = false, names = [] }) {
  const one = applied === 1 ? ` "${names[0] ?? ""}"` : "";
  const what = applied === 1 ? `${noun(scope, 1)}${one}` : `${applied} ${noun(scope, 2)}`;
  const done = {
    pause: `Paused ${what} in this game only. The advertiser sees the pause.`,
    resume: `Resumed ${what}.`,
    block: `Blocked ${what} in this game. The advertiser sees the status and your reason.`,
    unblock: `Unblocked ${what}. The advertiser sees the new status.`,
  }[action];
  const parts = [];
  if (bulkLimited) parts.push(`Try again later. This same bulk action was already made ${CHANGE_LIMIT} times in the last hour.`);
  else if (applied > 0) parts.push(done, "Players get this the next time they start the game.");
  else if (limited > 0) parts.push(`Try again later. The status of ${limited === 1 ? "this " + noun(scope, 1) : "these " + noun(scope, 2)} was already changed ${CHANGE_LIMIT} times in the last hour.`);
  else if (duplicates > 0) parts.push(`Nothing changed: ${duplicates === 1 ? "it is" : "they are"} already in this state. Repeated requests are not saved.`);
  if (applied > 0 && limited > 0) parts.push(`${limited} skipped: changed too often.`);
  if (applied > 0 && duplicates > 0) parts.push(`${duplicates} already in this state, not saved again.`);
  if (applied > 1) parts.push("Saved as one record.");
  return parts.join(" ");
}

/** True when a figure the log gives is the last allowed change this hour for an item (for the warning). */
export function isLastChange(recentOwnCount) {
  return recentOwnCount + 1 >= CHANGE_LIMIT;
}
