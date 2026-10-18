// Suspicious traffic (migration 0040): impressions that look wrong, for an admin to look at. Nothing is hidden or
// removed, and the rules only flag: every figure in the dashboards stays as it is. The rules themselves live in the
// SQL functions; this file names them, shapes their rows and says how worried to be. Pure, so it is tested without a
// database (test/traffic.test.mjs).

const number = (value) => Number(value ?? 0) || 0;

export const TRAFFIC_RULES = [
  { id: "future", label: "Stamped in the future", hint: "The SDK stamped the view more than 10 minutes after the moment it reached the server." },
  { id: "stale", label: "Stamped long ago", hint: "The SDK stamped the view more than 7 days before it reached the server." },
  { id: "too_long", label: "Over 30 minutes on one banner", hint: "A single view of one banner that lasted more than half an hour." },
  { id: "no_time", label: "No length", hint: "The view has no length at all, or a length of zero." },
  { id: "behind", label: "Seen from behind", hint: "Seen 90 degrees or more off head-on: from the side or the back of the banner." },
  { id: "session", label: "Too many in one session", hint: "One of more than 500 views in a single session." },
  { id: "player", label: "Same player, same ad, again and again", hint: "One of more than 150 views of the same creative by one player in one day." },
];

export const TRAFFIC_PERIODS = [7, 30, 90];

/** ?days= from the address -> one of the periods the database can look at. */
export function periodFrom(value) {
  const days = Number(value);
  return TRAFFIC_PERIODS.includes(days) ? days : 30;
}

/** A game needs this many views in the period before its share of flagged views says anything. */
export const TRAFFIC_MIN_VIEWS = 50;

/** Share of flagged views at which a game is worth a look, and at which it is worth a close one. */
export const TRAFFIC_WATCH = 0.05;
export const TRAFFIC_HIGH = 0.2;

export function levelOf(views, flagged) {
  if (views < TRAFFIC_MIN_VIEWS) return flagged > 0 ? "few" : "ok";
  const share = flagged / views;
  if (share >= TRAFFIC_HIGH) return "high";
  if (share >= TRAFFIC_WATCH) return "watch";
  return "ok";
}

/**
 * Rows of traffic_by_game() -> { totals, games, empty }.
 *   totals   views, flagged views, their share, and how many views broke each rule
 *   games    one per game, most flagged first: counts per rule and a level
 *            high / watch / ok by the share of flagged views, few = flagged but too few views to say
 * An impression that breaks two rules counts once in flagged and once in each rule.
 */
export function trafficTable(rows) {
  const games = (rows ?? []).map((row) => {
    const views = number(row.views);
    const flagged = number(row.flagged);
    return {
      id: row.game_id,
      name: row.game_name || "Game",
      views,
      flagged,
      share: views > 0 ? flagged / views : 0,
      level: levelOf(views, flagged),
      rules: Object.fromEntries(TRAFFIC_RULES.map((rule) => [rule.id, number(row[rule.id])])),
    };
  });
  const views = games.reduce((sum, game) => sum + game.views, 0);
  const flagged = games.reduce((sum, game) => sum + game.flagged, 0);
  return {
    games: games.sort((a, b) => b.flagged - a.flagged || b.views - a.views),
    totals: {
      views,
      flagged,
      share: views > 0 ? flagged / views : 0,
      rules: TRAFFIC_RULES.map((rule) => ({ ...rule, count: games.reduce((sum, game) => sum + game.rules[rule.id], 0) })),
    },
    empty: games.length === 0,
  };
}

/** Rows of traffic_samples() -> the flagged views of one game, newest first, each with the labels of its rules. */
export function samplesTable(rows) {
  const labels = new Map(TRAFFIC_RULES.map((rule) => [rule.id, rule.label]));
  return (rows ?? []).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    session: row.session_id,
    player: row.install_id ?? null,
    placement: row.placement ?? null,
    seconds: row.visible_seconds == null ? null : number(row.visible_seconds),
    distance: row.view_distance == null ? null : number(row.view_distance),
    angle: row.view_angle == null ? null : number(row.view_angle),
    rules: (row.rules ?? []).map((id) => ({ id, label: labels.get(id) ?? id })),
  }));
}

/** { missing, ...trafficTable }. missing = migration 0040 is not applied (the page says so). */
export async function loadTraffic(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, ...trafficTable([]) };
  return { missing: false, ...trafficTable(result.data) };
}

/** { missing, samples } for one game. */
export async function loadTrafficSamples(call) {
  const result = await call();
  if (result.error) return { missing: true, samples: [] };
  return { missing: false, samples: samplesTable(result.data) };
}
