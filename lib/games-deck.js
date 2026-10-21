// The widgets' figures for the Performance tab of "My games": the same figures as one game's board, added up over the games
// that are chosen. Each game answers its own questions (game_audience(), game_attention() ...); the rows of all games are
// merged here and then handed to the very loaders a single game uses, so every widget reads the same shapes.
// Players and sessions are counted per game, so a person who plays two games is counted in both (the tab says so).
// The merging is pure, so it is tested without a database (test/games-deck.test.mjs).

import { loadAudience } from "./audience.js";
import { loadAttention } from "./attention.js";
import { loadGameInteractions } from "./interactions.js";
import { loadGameFillRate } from "./fill-rate.js";
import { loadSdkPerformance } from "./sdk-performance.js";
import { loadFatigue, loadFrequency } from "./frequency.js";
import { loadRetention } from "./retention.js";
import { loadMinutes, loadScenes } from "./context.js";

const num = (value) => Number(value ?? 0) || 0;

/** Rows that share a key become one: the listed fields are added up (or take the largest), the rest comes from the first row. */
export function mergeRows(lists, keyOf, { sum = [], max = [] } = {}) {
  const merged = new Map();
  for (const rows of lists) {
    for (const row of rows ?? []) {
      const key = keyOf(row);
      const entry = merged.get(key);
      if (!entry) {
        const first = { ...row };
        for (const field of [...sum, ...max]) first[field] = num(row[field]);
        merged.set(key, first);
        continue;
      }
      for (const field of sum) entry[field] += num(row[field]);
      for (const field of max) entry[field] = Math.max(entry[field], num(row[field]));
    }
  }
  return [...merged.values()];
}

const ATTENTION_SUM = ["measured", "opportunities", "engaged", "under_2", "from_2_to_5", "from_5_to_10", "over_10"];
const ATTENTION_AVG = ["median_seconds", "avg_distance", "avg_fraction", "avg_angle"];

/** One row of game_attention() per game -> one row for all: counts added up, averages weighted by the measured views (a median becomes the weighted mean of the medians). */
export function mergeAttention(lists) {
  const rows = lists.map((rows_) => rows_?.[0]).filter(Boolean);
  if (rows.length === 0) return [];
  const out = {};
  for (const field of ATTENTION_SUM) out[field] = rows.reduce((total, row) => total + num(row[field]), 0);
  for (const field of ATTENTION_AVG) {
    const have = rows.filter((row) => row[field] != null && row[field] !== "" && num(row.measured) > 0);
    const weight = have.reduce((total, row) => total + num(row.measured), 0);
    out[field] = weight > 0 ? have.reduce((total, row) => total + num(row[field]) * num(row.measured), 0) / weight : null;
  }
  return [out];
}

const AUDIENCE = { sum: ["sessions", "players", "views", "visible_seconds", "visible_n"] };
const SDK = {
  sum: ["sessions", "frames", "seconds", "slow_frames", "hitches", "ad_frames", "ad_seconds", "ad_slow_frames", "loads", "load_ms", "cached_loads", "cached_ms", "manifest_loads", "manifest_ms", "manifest_failed", "manifest_cached", "creative_failed", "creative_invalid", "upload_failed"],
  max: ["worst_ms", "load_ms_max"],
};
const CONTEXT = { sum: ["views", "measured", "visible_seconds", "engaged"] };
const day = (value) => String(value ?? "").slice(0, 10);

/** What the merged answers of every RPC look like, keyed by the RPC and its argument. `games` is [{ id, name }] in the order the lists come. */
export const MERGE = {
  audience: (lists) => mergeRows(lists, (row) => row.value ?? "", AUDIENCE),
  attention: mergeAttention,
  interactions: (lists, games) => labelled(lists, games, (row) => row.placement_id ?? row.external_id),
  fill: (lists, games) => labelled(lists, games, (row) => row.external_id).map((row) => ({ ...row, external_id: row.key })),
  sdkAll: (lists) => mergeRows(lists, () => "all", SDK),
  sdkGroup: (lists) => mergeRows(lists, (row) => row.value ?? "", SDK).sort((a, b) => num(b.seconds) - num(a.seconds)),
  frequency: (lists) => mergeRows(lists, (row) => row.bucket, { sum: ["players", "views"] }),
  fatigue: (lists) => mergeRows(lists, (row) => row.exposure, { sum: ["views", "measured", "visible_seconds", "engaged"] }),
  retention: (lists) => mergeRows(lists, (row) => day(row.cohort), { sum: ["players", "d1", "d7", "d30"] }),
  daily: (lists) => mergeRows(lists, (row) => day(row.day), { sum: ["players", "sessions", "new_players"] }),
  scene: (lists, games) => mergeRows(lists.map((rows, index) => rows.map((row) => (games.length > 1 && typeof row.bucket === "string" && row.bucket ? { ...row, bucket: `${games[index].name} · ${row.bucket}` } : row))), (row) => row.bucket ?? "", CONTEXT),
  minute: (lists) => mergeRows(lists, (row) => row.bucket, CONTEXT),
};

/** Rows of a list of placements, one per placement: its name gets the game's name in front when several games are shown, and its key stays unique. */
function labelled(lists, games, keyOf) {
  return lists.flatMap((rows, index) =>
    (rows ?? []).map((row) => ({
      ...row,
      key: `${games[index].id}:${keyOf(row)}`,
      label: games.length > 1 ? `${games[index].name} · ${row.label || row.external_id || "Placement"}` : row.label || row.external_id || "Placement",
    }))
  );
}

/** At most `n` calls at a time: a board over many games must not open hundreds of connections at once. */
export function limiter(n) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= n || waiting.length === 0) return;
    active += 1;
    const { task, resolve, reject } = waiting.shift();
    task().then(resolve, reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return (task) => new Promise((resolve, reject) => {
    waiting.push({ task, resolve, reject });
    next();
  });
}

/**
 * The model the widgets read, for these games and this window ({ from, to }). `db` is the person's own client, so only
 * their games answer. A game whose call fails is left out of that widget; when every game fails the widget stays off.
 *   games: [{ id, name }]
 */
export async function loadGamesDeckModel({ db, games, win }) {
  const run = limiter(8);
  const base = { p_from: win.from, p_to: win.to };
  const fan = (rpc, merge, extra = {}) => async () => {
    const results = await Promise.all(games.map((game) => run(async () => db.rpc(rpc, { p_game_id: game.id, ...base, ...extra }))));
    const good = results.map((result, index) => ({ result, game: games[index] })).filter((entry) => !entry.result.error);
    if (good.length === 0) return { data: null, error: results.find((result) => result.error)?.error ?? { message: "no games" } };
    return { data: merge(good.map((entry) => entry.result.data ?? []), good.map((entry) => entry.game)), error: null };
  };
  const rows = (rpc, merge, extra) => fan(rpc, merge, extra);

  const [audience, attention, interactions, fill, sdk, frequency, fatigue, retention, scenes, minutes] = await Promise.all([
    loadAudience((dimension) => rows("game_audience", MERGE.audience, { p_dimension: dimension })()),
    loadAttention(rows("game_attention", MERGE.attention)),
    loadGameInteractions(rows("game_interactions", MERGE.interactions)),
    loadGameFillRate(rows("game_fill_rate", MERGE.fill)),
    loadSdkPerformance((dimension) => rows("game_sdk_performance", dimension === "all" ? MERGE.sdkAll : MERGE.sdkGroup, { p_dimension: dimension })()),
    loadFrequency(rows("game_frequency", MERGE.frequency)),
    loadFatigue(rows("game_fatigue", MERGE.fatigue)),
    loadRetention({ callRetention: rows("game_retention", MERGE.retention), callDaily: rows("game_dau", MERGE.daily), window: win, today: win.to }),
    loadScenes(rows("game_context", MERGE.scene, { p_dimension: "scene" })),
    loadMinutes(rows("game_context", MERGE.minute, { p_dimension: "minute" })),
  ]);
  return { audience, attention, interactions, fill, sdk, frequency, fatigue, retention, scenes, minutes };
}
