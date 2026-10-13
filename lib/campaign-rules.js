// What a campaign itself decides about where it is served (migration 0026): paused as a whole, an audience of its own,
// games its advertiser skipped. Pure: no database, so it can be tested alone (test/campaign-rules.test.mjs).
// The audience of each creative (migration 0018) still applies on top of this.

import { evaluate } from "./targeting.js";

/**
 * May a booking of this campaign be served in this game?
 *   rule:    { pausedAt, targeting, excluded: Set of game ids } or null (a campaign without rules)
 *   gameId:  the game asking for its manifest
 *   profile: the game's description { genres, platforms, languages }, or null when it could not be read
 * An audience that cannot be checked (profile unreadable) fails closed, like creative audiences.
 */
export function campaignMayServe(rule, gameId, profile) {
  if (!rule) return true;
  if (rule.pausedAt) return false;
  if (rule.excluded?.has(gameId)) return false;
  if (rule.targeting == null) return true;
  if (!profile) return false;
  return evaluate(profile, rule.targeting).fits;
}
