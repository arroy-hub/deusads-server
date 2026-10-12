import assert from "node:assert/strict";
import { pickForPlacement, rotate } from "../lib/rotation.js";
import { AD_CATEGORIES, isCategory, categoryLabel } from "../lib/categories.js";

const own = { placementId: "p1", source: "own", advertiserId: "dev", creativeId: "own1" };
const a1 = { placementId: "p1", source: "booking", advertiserId: "A", creativeId: "a1" };
const a2 = { placementId: "p1", source: "booking", advertiserId: "A", creativeId: "a2" };
const a3 = { placementId: "p1", source: "booking", advertiserId: "A", creativeId: "a3" };
const b1 = { placementId: "p1", source: "booking", advertiserId: "B", creativeId: "b1" };

// fallback: no bookings -> the developer's own creative
assert.equal(pickForPlacement([own]).creativeId, "own1");
assert.equal(pickForPlacement([]), null);
// several own creatives take turns when nobody is booked, with equal chance
const own2 = { ...own, creativeId: "own2" };
const own3 = { ...own, creativeId: "own3" };
assert.equal(pickForPlacement([own, own2, own3], () => 0).creativeId, "own1");
assert.equal(pickForPlacement([own, own2, own3], () => 0.4).creativeId, "own2");
assert.equal(pickForPlacement([own, own2, own3], () => 0.99).creativeId, "own3");
// ...and never when a booking is live
assert.equal(pickForPlacement([own, own2, a1], () => 0.9).creativeId, "a1");

// bookings win over own
assert.equal(pickForPlacement([own, a1], () => 0).creativeId, "a1");

// equal chance per advertiser, not per creative: A has 3 creatives, B has 1
const counts = { A: 0, B: 0 };
const rows = [a1, a2, a3, b1];
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 20000; i++) counts[pickForPlacement(rows, rng).advertiserId]++;
assert.ok(Math.abs(counts.A / 20000 - 0.5) < 0.02, `advertiser A got ${counts.A / 200}%`);

// random() at the edge (0.999..., 0) never indexes out of range
assert.ok(pickForPlacement(rows, () => 0.9999999).creativeId);
assert.ok(pickForPlacement(rows, () => 0).creativeId);

// one row per placement
const many = rotate([own, a1, b1, { ...own, placementId: "p2" }, { ...a1, placementId: "p3" }], () => 0);
assert.deepEqual(many.map((row) => row.placementId).sort(), ["p1", "p2", "p3"]);

// categories: 14, three restricted, same ids as migration 0015
assert.equal(AD_CATEGORIES.length, 14);
assert.deepEqual(AD_CATEGORIES.filter((c) => c.restricted).map((c) => c.id), ["alcohol_tobacco", "gambling", "dating_adult"]);
assert.ok(isCategory("finance") && !isCategory("nope"));
assert.equal(categoryLabel("unknown"), "Other");

console.log("rotation: all checks passed");
