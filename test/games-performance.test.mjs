import assert from "node:assert/strict";
import { facetsOf, gamesQuery, mergeDays, parseGamesParams, passesFilters, sumCells } from "../lib/games-performance.js";
import { windowOf } from "../lib/performance-view.js";
import { connection } from "../lib/connection.js";

// the address: unknown values fall back, defaults are left out
assert.deepEqual(parseGamesParams({ days: "999", src: "x" }), { days: 30, source: "all", games: [], types: [], formats: [] });
const state = parseGamesParams({ days: "7", src: "own", game: ["a", "b"], type: "banner" });
assert.equal(state.days, 7);
assert.equal(state.source, "own");
assert.equal(gamesQuery(state), "tab=performance&days=7&src=own&game=a&game=b&type=banner");
assert.equal(gamesQuery(parseGamesParams({})), "tab=performance");

// figures add up across games
const cell = (adv, own, sessions) => ({ adv, own, sessions, advSessions: 0, ownSessions: 0, advVisible: 0, advVisibleN: 0, ownVisible: 0, ownVisibleN: 0 });
const total = sumCells([cell(3, 1, 2), cell(5, 0, 4), undefined]);
assert.deepEqual([total.adv, total.own, total.sessions], [8, 1, 6]);

const win = windowOf(3, new Date("2026-10-14T10:00:00Z"));
const days = mergeDays(win, [
  [{ day: "2026-10-13", adv: 2, own: 1 }],
  [{ day: "2026-10-13", adv: 4, own: 0 }, { day: "2026-10-14", adv: 1, own: 1 }],
]);
assert.deepEqual(days.map((day) => [day.date, day.adv + day.own]), [["2026-10-12", 0], ["2026-10-13", 7], ["2026-10-14", 2]]);

// filters by place type and format
const item = { id: "p1", placeType: "banner", suggestedType: null, format: "Wide", places: [], tags: [], folderId: null };
assert.equal(passesFilters(item, { types: [], formats: [] }), true);
assert.equal(passesFilters(item, { types: ["banner"], formats: ["Wide"] }), true);
assert.equal(passesFilters(item, { types: ["banner"], formats: ["Tall"] }), false);
assert.ok(facetsOf([[item]]).formats.some((option) => option.value === "Wide"));

// the words on a game's card
const now = Date.parse("2026-10-14T12:00:00Z");
assert.deepEqual([connection(null, now).label, connection(null, now).line], ["Not connected", "waiting for first sync"]);
assert.equal(connection("2026-10-14T09:00:00Z", now).line, "synced today");
assert.deepEqual([connection("2026-09-16T12:00:00Z", now).label, connection("2026-09-16T12:00:00Z", now).line], ["Out of sync", "synced 28 days ago"]);
console.log("games-performance ok");
