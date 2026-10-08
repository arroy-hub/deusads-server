// Pure-function checks for lib/analytics.js. Run: node test/analytics.test.mjs
import assert from "node:assert/strict";
import { fillDays, formatDay, lastDays, niceMax, placementRows } from "../lib/analytics.js";

const now = new Date("2026-10-09T00:30:00+04:00"); // 2026-10-08 20:30 UTC

// --- the window is UTC days, oldest first, ending today (UTC)
const days = lastDays(3, now);
assert.deepEqual(days, ["2026-10-06", "2026-10-07", "2026-10-08"]);
assert.equal(lastDays(30, now).length, 30);
assert.deepEqual(lastDays(2, new Date("2026-03-01T12:00:00Z")), ["2026-02-28", "2026-03-01"]);

// --- quiet days become zeros, counts become numbers
const filled = fillDays(
  [{ day: "2026-10-08", impressions: "12", sessions: "3" }, { day: "2026-10-06", impressions: 5, sessions: 2 }],
  3,
  now
);
assert.deepEqual(filled, [
  { date: "2026-10-06", impressions: 5, sessions: 2 },
  { date: "2026-10-07", impressions: 0, sessions: 0 },
  { date: "2026-10-08", impressions: 12, sessions: 3 },
]);
assert.equal(fillDays(null, 2, now).every((d) => d.impressions === 0), true);

// --- clean axis tops
assert.equal(niceMax(0), 4);
assert.equal(niceMax(3), 4);
assert.equal(niceMax(4), 4);
assert.equal(niceMax(5), 5);
assert.equal(niceMax(7), 10);
assert.equal(niceMax(23), 25);
assert.equal(niceMax(48), 50);
assert.equal(niceMax(1148), 2000);
assert.equal(niceMax(2000), 2000);
assert.equal(niceMax(2001), 2500);
assert.ok(niceMax(1234567) >= 1234567);
for (const peak of [5, 9, 11, 99, 101, 999, 1001, 54321]) {
  assert.ok(niceMax(peak) >= peak, `axis top covers ${peak}`);
}

// --- labels
assert.equal(formatDay("2026-09-10"), "10 Sep");
assert.equal(formatDay("2026-01-01"), "1 Jan");

// --- per-placement table
const live = [
  { id: "p1", external_id: "a", label: "Arena", scene: "Main" },
  { id: "p2", external_id: "b", label: null, scene: null },
  { id: "p3", external_id: "c", label: "Quiet", scene: "Menu" },
];
const stats = [
  { placement_id: "p1", impressions: "40", sessions: "9", avg_visible_seconds: "2.50" },
  { placement_id: "p2", impressions: "100", sessions: "20", avg_visible_seconds: null },
  { placement_id: "gone", impressions: "7", sessions: "2", avg_visible_seconds: "1.0" },
  { placement_id: "gone2", impressions: "3", sessions: "1", avg_visible_seconds: "1.0" },
];
const rows = placementRows(live, stats);
assert.deepEqual(rows.map((r) => r.label), ["b", "Arena", "Quiet", "Removed placements"]);
assert.equal(rows[0].impressions, 100);
assert.equal(rows[0].avgVisible, null);
assert.equal(rows[1].avgVisible, 2.5);
assert.equal(rows[2].impressions, 0, "a placement with no impressions still appears");
assert.equal(rows[3].impressions, 10);
assert.equal(rows[3].sessions, null);
assert.equal(placementRows(live, []).length, 3, "no folded row when nothing was removed");
assert.equal(placementRows([], null).length, 0);

console.log("analytics: all checks passed");
