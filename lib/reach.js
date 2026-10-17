// Reach and frequency for an advertiser, worked out from one row of advertiser_totals() (migration 0032).
// Players are distinct anonymous install IDs the SDK (0.9+) sends; a session is one stretch of play.
// Pure, so the rules are tested without a database (test/reach.test.mjs).

const number = (value) => Number(value ?? 0) || 0;

/**
 * { players, sessions, impressions, perSession, perPlayer } for one totals row.
 *   perSession  all impressions / all sessions: how many of the ads an average session showed
 *   perPlayer   impressions per unique player. Only impressions that carry an install ID count (player_views),
 *               so rows from older SDKs, which cannot be tied to a player, never inflate it.
 * A ratio is null when it cannot be told (no sessions, no players yet).
 */
export function reachFigures(row) {
  const players = number(row?.players);
  const sessions = number(row?.sessions);
  const impressions = number(row?.impressions);
  const playerViews = number(row?.player_views);
  return {
    players,
    sessions,
    impressions,
    perSession: sessions > 0 ? impressions / sessions : null,
    perPlayer: players > 0 ? playerViews / players : null,
  };
}
