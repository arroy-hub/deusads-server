import assert from "node:assert/strict";
import { buildSplits, byDay, byWeek, chartEvents, colorOf, dashOf, mergeSplit, selectionTotals, sortCampaigns, spreadLabels, sumSeries, weekdayDay } from "../lib/overview-chart.js";

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

// reached games (those that showed the ad) are counted apart from the booked ones
const r1 = { ...a, gameIds: ["g1", "g2", "g3"], reachedIds: ["g1"] };
assert.equal(selectionTotals([r1]).games, 1);
assert.equal(selectionTotals([r1]).gamesBooked, 3);

assert.equal(weekdayDay("2026-10-10"), "Sat 10 Oct");
assert.equal(dashOf(0), undefined);
assert.notEqual(dashOf(1), undefined);

// splits by creative, game and format
const rows = [
  { day: "2026-10-01", creative_id: "c1", placement_id: "p1", impressions: 5 },
  { day: "2026-10-02", creative_id: "c1", placement_id: "p2", impressions: 3 },
  { day: "2026-10-02", creative_id: "c2", placement_id: "p1", impressions: 2 },
  { day: "2026-09-01", creative_id: "c1", placement_id: "p1", impressions: 99 },
];
const split = buildSplits({
  rows,
  dates: dates.slice(0, 3),
  creatives: new Map([["c1", "Hero"], ["c2", "Square"]]),
  places: new Map([["p1", { gameId: "g1", game: "Neon", aspect: 16 / 9 }], ["p2", { gameId: "g2", game: "Orbit", aspect: 1 }]]),
});
assert.deepEqual(split.creative.find((item) => item.key === "c1").daily, [5, 3, 0], "days outside the period are ignored");
assert.equal(split.game.find((item) => item.key === "g1").daily[1], 2);
assert.equal(split.format.find((item) => item.key === "16:9 landscape")?.daily[0] ?? split.format[0].daily[0], 5);
assert.equal(split.format.length, 2);

const merged = mergeSplit([split, split], "creative", 3);
assert.deepEqual(merged[0].daily, [10, 6, 0]);
assert.equal(merged[0].name, "Hero", "busiest first");
const many = { creative: Array.from({ length: 8 }, (_, i) => ({ key: "k" + i, name: "K" + i, daily: [10 - i, 0, 0] })) };
const folded = mergeSplit([many], "creative", 3, 6);
assert.equal(folded.length, 6);
assert.equal(folded[5].key, "other");
assert.equal(folded[5].daily[0], 5 + 4 + 3);

// names at the line ends keep apart and in order
const spread = spreadLabels([100, 105, 110, 200], 16);
assert.ok(spread[1] - spread[0] >= 16 && spread[2] - spread[1] >= 16);
assert.equal(spread[3], 200);

assert.deepEqual(
  chartEvents({ campaigns: [{ id: "a", events: [{ date: "2026-10-02", kind: "live", label: "x" }, { date: "2026-08-01", kind: "paused", label: "old" }] }], dates }).map((event) => event.label),
  ["x"]
);

console.log("overview-chart tests passed");
