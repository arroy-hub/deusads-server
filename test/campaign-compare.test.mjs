import assert from "node:assert/strict";
import { MIN_VIEWS, compareByKind, compareFigures } from "../lib/campaign-compare.js";

const row = { kind: "creative", id: "c1", impressions: 400, measured: 300, opportunities: 600, engaged: 90, interactive: 50, touched: 10, players: 80, player_views: 360, visible_seconds: 1800 };
const f = compareFigures(row);
assert.equal(f.few, false);
assert.equal(f.engaged, 0.3);
assert.equal(f.viewable, 0.5);
assert.equal(f.touched, 0.2);
assert.equal(f.hours, 0.5);
assert.equal(f.players, 80);
assert.equal(f.perPlayer, 4.5);

// viewable never goes over 100%
assert.equal(compareFigures({ ...row, opportunities: 100 }).viewable, 1);
// nothing to divide by: null, not zero
const bare = compareFigures({ impressions: 500, visible_seconds: 0 });
assert.equal(bare.engaged, null);
assert.equal(bare.viewable, null);
assert.equal(bare.touched, null);
assert.equal(bare.players, null);
assert.equal(bare.perPlayer, null);
// no interactive placement: Touched is null, the rest still counts
assert.equal(compareFigures({ ...row, interactive: 0, touched: 0 }).touched, null);
// a small sample shows dashes for the shares, keeps the plain sums
const few = compareFigures({ ...row, impressions: MIN_VIEWS - 1 });
assert.equal(few.few, true);
assert.equal(few.engaged, null);
assert.equal(few.viewable, null);
assert.equal(few.touched, null);
assert.equal(few.perPlayer, null);
assert.equal(few.players, 80);
assert.equal(compareFigures({ ...row, impressions: MIN_VIEWS }).few, false);
// no rows, no crash
assert.deepEqual(compareByKind(null), { creatives: {}, games: {} });
const by = compareByKind([row, { ...row, kind: "game", id: "g1" }]);
assert.equal(by.creatives.c1.players, 80);
assert.equal(by.games.g1.players, 80);
console.log("campaign-compare ok");
