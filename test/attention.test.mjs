import assert from "node:assert/strict";
import { BUCKETS, ENGAGED_METRES, ENGAGED_SECONDS, attentionFigures, loadAttention } from "../lib/attention.js";

assert.equal(ENGAGED_SECONDS, 3);
assert.equal(ENGAGED_METRES, 3);
assert.deepEqual(BUCKETS.map((bucket) => bucket.id), ["under_2", "from_2_to_5", "from_5_to_10", "over_10"]);

// a normal row, numbers as Postgres sends them (strings for numeric)
const f = attentionFigures({
  measured: "200", opportunities: "400", avg_distance: "2.50", avg_fraction: "0.0800", avg_angle: "21.5", median_seconds: "4.20",
  under_2: 50, from_2_to_5: 100, from_5_to_10: 30, over_10: 20, engaged: 60,
});
assert.equal(f.measured, 200);
assert.equal(f.opportunities, 400);
assert.equal(f.viewability, 0.5);
assert.equal(f.medianSeconds, 4.2);
assert.equal(f.avgDistance, 2.5);
assert.equal(f.avgFraction, 0.08);
assert.equal(f.avgAngle, 21.5);
assert.equal(f.engaged, 60);
assert.equal(f.engagedRate, 0.3);
assert.deepEqual(f.buckets.map((bucket) => bucket.share), [0.25, 0.5, 0.15, 0.1]);
assert.equal(f.empty, false);

// more views than chances (a lost upload, a clock skew) never shows more than 100%
assert.equal(attentionFigures({ measured: 10, opportunities: 8 }).viewability, 1);

// nothing measured: no ratio is made up
const none = attentionFigures({ measured: 0, opportunities: 0, median_seconds: null });
assert.equal(none.empty, true);
assert.equal(none.viewability, null);
assert.equal(none.medianSeconds, null);
assert.equal(none.engagedRate, null);
assert.ok(none.buckets.every((bucket) => bucket.share === 0));

// views but no chances yet (chances arrive in the same SDK, so this is a half-sent batch): no rate, the rest is shown
const half = attentionFigures({ measured: 5, opportunities: 0, median_seconds: "3.00", avg_distance: "1.00" });
assert.equal(half.viewability, null);
assert.equal(half.medianSeconds, 3);
assert.equal(half.empty, false);

// chances but no measured view: the seen rate is not 0%, it is unknown
const unseen = attentionFigures({ measured: 0, opportunities: 12 });
assert.equal(unseen.viewability, null);
assert.equal(unseen.empty, false);

assert.deepEqual(attentionFigures(null).buckets.map((bucket) => bucket.count), [0, 0, 0, 0]);
assert.equal(attentionFigures(undefined).empty, true);

// loading: a failing call (migration 0035 not run) turns the panel off
assert.deepEqual(await loadAttention(async () => ({ data: [{ measured: 1 }] })), { row: { measured: 1 }, missing: false });
assert.deepEqual(await loadAttention(async () => ({ data: [] })), { row: null, missing: false });
const failed = await loadAttention(async () => ({ error: { code: "42883" } }));
assert.equal(failed.missing, true);
assert.equal(failed.row, null);

console.log("attention: ok");
