import assert from "node:assert/strict";
import { limiter, loadGamesDeckModel, mergeAttention, mergeRows } from "../lib/games-deck.js";

// mergeRows adds up rows with the same key and keeps the rest of the first one
const merged = mergeRows([[{ value: "a", n: "2", top: 3, label: "x" }], [{ value: "a", n: 5, top: 9 }, { value: "b", n: 1, top: 1 }]], (row) => row.value, { sum: ["n"], max: ["top"] });
assert.equal(merged.length, 2);
assert.deepEqual(merged.find((row) => row.value === "a"), { value: "a", n: 7, top: 9, label: "x" });

// attention: counts are added, averages are weighted by the measured views, no data stays empty
assert.deepEqual(mergeAttention([[], []]), []);
const attention = mergeAttention([[{ measured: 10, opportunities: 20, engaged: 5, median_seconds: 2, avg_distance: null }], [{ measured: 30, opportunities: 40, engaged: 6, median_seconds: 4, avg_distance: 2 }]])[0];
assert.equal(attention.measured, 40);
assert.equal(attention.opportunities, 60);
assert.equal(attention.median_seconds, 3.5);
assert.equal(attention.avg_distance, 2);
assert.equal(attention.avg_angle, null);

// the limiter never runs more than n tasks at once
const gate = limiter(2);
let running = 0;
let most = 0;
await Promise.all(Array.from({ length: 7 }, () => gate(async () => { running += 1; most = Math.max(most, running); await new Promise((done) => setTimeout(done, 5)); running -= 1; })));
assert.equal(most, 2);

// the whole model, from a database that answers per game
const games = [{ id: "g1", name: "Alpha" }, { id: "g2", name: "Beta" }];
const win = { from: "2026-09-01", to: "2026-09-30", days: 30 };
const answers = {
  game_audience: () => [{ value: "quest", sessions: 10, players: 5, views: 20, visible_seconds: 60, visible_n: 20 }],
  game_attention: () => [{ measured: 10, opportunities: 20, engaged: 5, under_2: 2, from_2_to_5: 3, from_5_to_10: 3, over_10: 2, median_seconds: 2 }],
  game_interactions: () => [{ placement_id: "p", label: "Wall", views: 10, interacted: 2, interactions: 3 }],
  game_fill_rate: () => [{ external_id: "w", label: "Wall", offered: 10, filled_ad: 5, filled_own: 1 }],
  game_sdk_performance: () => [{ value: "quest", sessions: 2, frames: 100, seconds: 10, worst_ms: 30, load_ms_max: 5 }],
  game_frequency: () => [{ bucket: "v1", players: 4, views: 4 }],
  game_fatigue: () => [{ exposure: "e1", views: 4, measured: 4, visible_seconds: 8, engaged: 1 }],
  game_retention: () => [{ cohort: "2026-09-01", players: 10, d1: 5, d7: 2, d30: 0 }],
  game_dau: () => [{ day: "2026-09-02", players: 4, sessions: 5, new_players: 1 }],
  game_context: (args) => [{ bucket: args.p_dimension === "scene" ? "Menu" : "m0", views: 5, measured: 5, visible_seconds: 10, engaged: 1 }],
};
const dbWith = (failFor = () => false) => ({ rpc: (name, args) => Promise.resolve(failFor(name, args) ? { data: null, error: { code: "42883", message: "missing" } } : { data: answers[name](args), error: null }) });

const model = await loadGamesDeckModel({ db: dbWith(), games, win });
assert.equal(model.audience.missing, false);
assert.equal(model.audience.dimensions.platform[0].sessions, 20);
assert.equal(model.attention.row.measured, 20);
assert.equal(model.interactions.places.length, 2);
assert.deepEqual(model.interactions.places.map((place) => place.name).sort(), ["Alpha · Wall", "Beta · Wall"]);
assert.equal(model.fill.totals.offered, 20);
assert.equal(new Set(model.fill.places.map((place) => place.id)).size, 2);
assert.equal(model.sdk.total.sessions, 4);
assert.equal(model.sdk.total.worstMs, 30);
assert.equal(model.frequency.players, 8);
assert.equal(model.retention.retention.newPlayers, 20);
assert.equal(model.retention.daily.days.find((day) => day.date === "2026-09-02").players, 8);
assert.deepEqual(model.scenes.rows.map((row) => row.label).sort(), ["Alpha · Menu", "Beta · Menu"]);
assert.equal(model.minutes.rows.find((row) => row.id === "m0").views, 10);

// one game that fails is left out of that widget; one game alone keeps plain names
const partial = await loadGamesDeckModel({ db: dbWith((name, args) => name === "game_audience" && args.p_game_id === "g2"), games, win });
assert.equal(partial.audience.dimensions.platform[0].sessions, 10);
const single = await loadGamesDeckModel({ db: dbWith(), games: [games[0]], win });
assert.deepEqual(single.interactions.places.map((place) => place.name), ["Wall"]);
assert.deepEqual(single.scenes.rows.map((row) => row.label), ["Menu"]);

// every game failing switches the widget off, the others carry on
const off = await loadGamesDeckModel({ db: dbWith((name) => name === "game_attention"), games, win });
assert.equal(off.attention.missing, true);
assert.equal(off.audience.missing, false);

console.log("games deck: all checks passed");
