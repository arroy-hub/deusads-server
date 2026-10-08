// Advertiser report helpers (lib/reports.js). Run: node test/reports.test.mjs
import assert from "node:assert/strict";
import { parseRange, reportRows } from "../lib/reports.js";

assert.equal(parseRange("7"), 7);
assert.equal(parseRange("90"), 90);
assert.equal(parseRange("30"), 30);
for (const bad of ["1", "365", "abc", "", null, undefined, "-7"]) assert.equal(parseRange(bad), 30, String(bad));

const booking = (over) => ({
  placementId: "p1", creativeId: "c1", status: "approved", game: "Game", placement: "Poster",
  scene: "Hall", creativeName: "Ad", campaign: "Autumn", ...over,
});
const stat = (placement_id, creative_id, impressions, sessions = 1, avg = 2.5) => ({
  placement_id, creative_id, impressions, sessions, avg_visible_seconds: avg,
});

// a live booking with no impressions still shows, as zero
let rows = reportRows([booking({})], []);
assert.equal(rows.length, 1);
assert.equal(rows[0].impressions, 0);
assert.equal(rows[0].live, true);
assert.equal(rows[0].avgVisible, null);

// a stopped booking shows only if it delivered something
rows = reportRows([booking({ status: "rejected" })], []);
assert.equal(rows.length, 0);
rows = reportRows([booking({ status: "cancelled" })], [stat("p1", "c1", 12, 3, "1.25")]);
assert.equal(rows.length, 1);
assert.equal(rows[0].impressions, 12);
assert.equal(rows[0].live, false);
assert.equal(rows[0].avgVisible, 1.25);

// busiest first; numbers from the database arrive as strings
rows = reportRows(
  [booking({ placementId: "p1" }), booking({ placementId: "p2", placement: "Banner" })],
  [stat("p1", "c1", "5"), stat("p2", "c1", "40")]
);
assert.deepEqual(rows.map((row) => row.impressions), [40, 5]);

// impressions whose booking is gone are kept in a last row
rows = reportRows([booking({})], [stat("p1", "c1", 5), stat("p9", "c9", 7), stat("p8", "c8", 3)]);
assert.equal(rows.length, 2);
assert.equal(rows.at(-1).label, "Removed bookings");
assert.equal(rows.at(-1).impressions, 10);
assert.equal(rows.at(-1).sessions, null);

// the newest booking names a pair that was booked twice
rows = reportRows(
  [booking({ campaign: "New" }), booking({ campaign: "Old", status: "cancelled" })],
  [stat("p1", "c1", 4)]
);
assert.equal(rows.length, 1);
assert.equal(rows[0].campaign, "New");

console.log("reports: all checks passed");
