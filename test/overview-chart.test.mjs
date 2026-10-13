import assert from "node:assert/strict";
import { byDay, byWeek, colorOf, selectionTotals, sortCampaigns, sumSeries } from "../lib/overview-chart.js";

const dates = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
assert.deepEqual(byWeek([1, 1, 1, 1, 1, 1, 1, 2, 2, 2], dates).map((row) => row.value), [7, 6]);
assert.equal(byWeek([1, 1, 1, 1, 1, 1, 1, 2, 2, 2], dates)[1].date, "2026-10-08");
assert.equal(byDay([4, 5], dates)[1].value, 5);
assert.deepEqual(sumSeries([[1, 2, 3], [10, 20, 30]], 3), [11, 22, 33]);
assert.equal(colorOf(0), colorOf(8));

const a = { id: "a", name: "Spring", impressions: 100, avgVisible: 6, games: 2, gameIds: ["g1", "g2"], previousDaily: [50, 50] };
const b = { id: "b", name: "Summer", impressions: 300, avgVisible: 8, games: 2, gameIds: ["g2", "g3"], previousDaily: [0, 0] };
const c = { id: "c", name: "Autumn", impressions: 0, avgVisible: null, games: 0, gameIds: [], previousDaily: [0, 0] };

const both = selectionTotals([a, b]);
assert.equal(both.impressions, 400);
assert.equal(both.games, 3, "games are counted once");
assert.equal(both.avgVisible, (600 + 2400) / 400, "weighted by impressions");
assert.deepEqual(both.delta, { text: "+300%", tone: "up" });
assert.equal(selectionTotals([c]).avgVisible, null);
assert.equal(selectionTotals([]).impressions, 0);

assert.deepEqual(sortCampaigns([a, b, c], "impressions", "desc").map((row) => row.id), ["b", "a", "c"]);
assert.deepEqual(sortCampaigns([a, b, c], "avgVisible", "asc").map((row) => row.id), ["a", "b", "c"], "missing numbers last");
assert.deepEqual(sortCampaigns([b, a], "name", "asc").map((row) => row.id), ["a", "b"]);
assert.deepEqual(sortCampaigns([a, b], "change", "desc").map((row) => row.id), ["a", "b"], "no previous period goes last");

console.log("overview-chart tests passed");
