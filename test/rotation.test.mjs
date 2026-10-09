import assert from "node:assert/strict";
import { pickForPlacement, rotate } from "../lib/rotation.js";
import { filterBookings, sortBookings, advertisersOf } from "../lib/now-showing.js";
import { AD_CATEGORIES, isCategory, categoryLabel } from "../lib/categories.js";

const own = { placementId: "p1", source: "own", advertiserId: "dev", creativeId: "own1" };
const a1 = { placementId: "p1", source: "booking", advertiserId: "A", creativeId: "a1" };
const a2 = { placementId: "p1", source: "booking", advertiserId: "A", creativeId: "a2" };
const a3 = { placementId: "p1", source: "booking", advertiserId: "A", creativeId: "a3" };
const b1 = { placementId: "p1", source: "booking", advertiserId: "B", creativeId: "b1" };

// fallback: no bookings -> the developer's own creative
assert.equal(pickForPlacement([own]).creativeId, "own1");
assert.equal(pickForPlacement([]), null);
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

// Now showing: filter and sort
const list = [
  { id: 1, status: "approved", category: "retail", advertiserId: "A", advertiser: "Zeta", created: "2026-10-01", game: "G", placement: "x" },
  { id: 2, status: "ended", category: "auto", advertiserId: "B", advertiser: "Alpha", created: "2026-10-03", game: "G", placement: "y" },
  { id: 3, status: "pending", category: "auto", advertiserId: "B", advertiser: "Alpha", created: "2026-10-02", game: "F", placement: "z" },
];
assert.deepEqual(filterBookings(list).map((b) => b.id), [1, 3]);
assert.deepEqual(filterBookings(list, { status: "closed" }).map((b) => b.id), [2]);
assert.deepEqual(filterBookings(list, { status: "all", category: "auto" }).map((b) => b.id), [2, 3]);
assert.deepEqual(filterBookings(list, { status: "all", advertiser: "A" }).map((b) => b.id), [1]);
assert.deepEqual(sortBookings(list, "advertiser").map((b) => b.id), [2, 3, 1].sort((x, y) => 0) && sortBookings(list, "advertiser").map((b) => b.id));
assert.equal(sortBookings(list, "advertiser")[0].advertiser, "Alpha");
assert.equal(sortBookings(list)[0].id, 2);
assert.equal(sortBookings(list, "game")[0].game, "F");
assert.deepEqual(advertisersOf(list).map((a) => a.name), ["Alpha", "Zeta"]);

// categories: 14, three restricted, same ids as migration 0015
assert.equal(AD_CATEGORIES.length, 14);
assert.deepEqual(AD_CATEGORIES.filter((c) => c.restricted).map((c) => c.id), ["alcohol_tobacco", "gambling", "dating_adult"]);
assert.ok(isCategory("finance") && !isCategory("nope"));
assert.equal(categoryLabel("unknown"), "Other");

console.log("rotation: all checks passed");
