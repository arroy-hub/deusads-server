// Earnings cut the way the Performance tab cuts views (lib/performance-earnings.js). Run: node test/performance-earnings.test.mjs
import assert from "node:assert/strict";
import { applyPaid, paidTypes } from "../lib/performance-earnings.js";
import { cellFrom, dayCells, emptyCell } from "../lib/performance-view.js";
import { paidIndex } from "../lib/wallet.js";

assert.equal(emptyCell().paid, 0);
assert.equal(cellFrom({ adv: 5 }).paid, 0, "the database does not answer what was paid");
assert.equal(cellFrom({ adv: 5, paid: "3" }).paid, 3);

const item = (id, placeType) => ({ id, externalId: id, label: id, folderId: null, tags: [], placeType, suggestedType: null, format: "16:9", places: [] });
const items = [item("p1", "gameplay"), item("p2", "menu"), item("p3", "menu")];
const paid = {
  places: [
    { day: "2026-11-22", placement_id: "p1", place_id: null, impressions: 10 },
    { day: "2026-11-23", placement_id: "p1", place_id: "s1", impressions: 4 },
    { day: "2026-11-23", placement_id: "p2", place_id: null, impressions: 6 },
    { day: "2026-11-23", placement_id: "gone", place_id: null, impressions: 2 },
  ],
  campaigns: [
    { id: "c1", name: "Alpha", advertiser: "A", placement_id: "p1", place_id: null, impressions: 10 },
    { id: "c1", name: "Alpha", advertiser: "A", placement_id: "p1", place_id: "s1", impressions: 4 },
    { id: "c2", name: "Beta", advertiser: "B", placement_id: "p2", place_id: null, impressions: 6 },
    { id: "c2", name: "Beta", advertiser: "B", placement_id: "gone", place_id: null, impressions: 2 },
  ],
};

// no wallet: nothing changes and the block stays off
{
  const cellOf = new Map([["s0", cellFrom({ adv: 20 })]]);
  const earn = applyPaid({ paid: null, scopes: [{ key: "s0", all: true }], cellOf, chartKey: "s0", dayRows: [], items });
  assert.deepEqual(earn, { on: false, campaigns: [], types: [] });
  assert.equal(cellOf.get("s0").paid, 0);
}

// the whole game
{
  const scopes = [{ key: "s0", all: true }, { key: "s1", members: [{ placement: "p1" }] }, { key: "s2", members: [{ placement: "p1", place: "s1" }] }, { key: "s3", members: [{ placement: "p3" }] }];
  const cellOf = new Map([["s0", cellFrom({ adv: 30 })], ["s1", cellFrom({ adv: 20 })], ["s2", cellFrom({ adv: 4 })]]);
  const dayRows = [{ day: "2026-11-22T00:00:00", adv: 12 }, { day: "2026-11-23", adv: 18 }];
  const earn = applyPaid({ paid, scopes, cellOf, chartKey: "s0", dayRows, items });
  assert.equal(earn.on, true);
  assert.deepEqual([cellOf.get("s0").paid, cellOf.get("s1").paid, cellOf.get("s2").paid], [22, 14, 4]);
  assert.equal(cellOf.has("s3"), false, "nothing paid, no views: no cell is made up");
  assert.deepEqual(dayRows.map((row) => row.paid), [10, 12]);
  assert.deepEqual(dayCells({ from: "2026-11-21", to: "2026-11-23", days: 3 }, dayRows).map((d) => d.paid), [0, 10, 12], "the chart's days carry what was paid");
  assert.deepEqual(earn.campaigns.map((row) => [row.id, row.impressions]), [["c1", 14], ["c2", 8]]);
  assert.deepEqual(earn.types.map((row) => row.impressions), [14, 6, 2]);
  assert.equal(earn.types[2].label, "Removed placements");
}

// a selection: only its placements count, in the cells, the days, the campaigns and the types
{
  const scopes = [{ key: "s0", members: [{ placement: "p2" }, { placement: "p3" }] }];
  const cellOf = new Map();
  const dayRows = [{ day: "2026-11-23", adv: 6 }];
  const earn = applyPaid({ paid, scopes, cellOf, chartKey: "s0", dayRows, items });
  assert.equal(cellOf.get("s0").paid, 6, "paid without a counted view still shows");
  assert.deepEqual(dayRows.map((row) => row.paid), [6]);
  assert.deepEqual(earn.campaigns.map((row) => [row.id, row.impressions]), [["c2", 6]]);
  assert.equal(earn.types.length, 1);
}

assert.deepEqual(paidTypes(null, paidIndex([]), items), []);
console.log("performance earnings: all checks passed");
