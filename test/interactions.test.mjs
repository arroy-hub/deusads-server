import assert from "node:assert/strict";
import { interactionTable, loadAdvertiserInteractions, loadGameInteractions, totalsOf } from "../lib/interactions.js";

// totals: the rate is views with a touch over views, so it cannot pass 100%
const t = totalsOf({ placements: "2", views: "50", interacted: "10", interactions: "25" });
assert.deepEqual(t, { placements: 2, views: 50, interacted: 10, interactions: 25, rate: 0.2, perInteracted: 2.5 });

// nothing yet: no rate is made up
const none = totalsOf(null);
assert.equal(none.rate, null);
assert.equal(none.perInteracted, null);
assert.equal(none.placements, 0);

// views but no touch: a real 0%, not an unknown
const quiet = totalsOf({ placements: 1, views: 8, interacted: 0, interactions: 0 });
assert.equal(quiet.rate, 0);
assert.equal(quiet.perInteracted, null);

// developer table: busiest first, totals summed, a placement without views has no rate
const table = interactionTable([
  { placement_id: "p1", external_id: "bottle", label: "Bottle label", views: 10, interacted: 5, interactions: 9 },
  { placement_id: "p2", external_id: "poster", label: null, views: 30, interacted: 3, interactions: 3 },
  { placement_id: "p3", external_id: "coin", label: "Coin", views: 0, interacted: 0, interactions: 0 },
]);
assert.deepEqual(table.places.map((place) => place.name), ["poster", "Bottle label", "Coin"]);
assert.equal(table.places[0].rate, 0.1);
assert.equal(table.places[2].rate, null);
assert.equal(table.totals.placements, 3);
assert.equal(table.totals.views, 40);
assert.equal(table.totals.interacted, 8);
assert.equal(table.totals.interactions, 12);
assert.equal(table.totals.rate, 0.2);
assert.deepEqual(interactionTable(undefined).places, []);

// loading
const dev = await loadGameInteractions(async () => ({ data: [{ placement_id: "p1", external_id: "a", views: 4, interacted: 1, interactions: 1 }] }));
assert.equal(dev.missing, false);
assert.equal(dev.places.length, 1);
assert.equal(dev.totals.rate, 0.25);

const adv = await loadAdvertiserInteractions(async () => ({ data: [{ placements: 1, views: 4, interacted: 2, interactions: 3 }] }));
assert.equal(adv.missing, false);
assert.equal(adv.totals.rate, 0.5);
assert.deepEqual(adv.places, []);

// no interactive placement ran: an empty row, not an error
const idle = await loadAdvertiserInteractions(async () => ({ data: [{ placements: 0, views: 0, interacted: 0, interactions: 0 }] }));
assert.equal(idle.totals.placements, 0);

// migration 0036 missing: the panel turns itself off
for (const load of [loadGameInteractions, loadAdvertiserInteractions]) {
  const failed = await load(async () => ({ error: { code: "42883" } }));
  assert.equal(failed.missing, true);
  assert.equal(failed.totals.rate, null);
}

console.log("interactions: ok");
