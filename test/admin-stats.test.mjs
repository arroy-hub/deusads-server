import assert from "node:assert/strict";
import { countBy, median, percentile, weekly, hours, pct, bars, cols } from "../lib/admin-stats.js";

assert.deepEqual(countBy(["a", "b", "a", null, "", "c", "b", "a"], (x) => x), [["a", 3], ["b", 2], ["c", 1]]);
assert.deepEqual(countBy(["b", "a"], (x) => x), [["a", 1], ["b", 1]]);
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([]), 0);
assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 10);
assert.equal(percentile([], 0.9), 0);
assert.deepEqual(weekly([{ a: 0 }, { a: 6 }, { a: 7 }, { a: 200 }, { a: 90 }], (x) => x.a, 13), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
assert.equal(hours(2.34), "2.3 h");
assert.equal(hours(60), "2.5 d");
assert.equal(hours(null), "—");
assert.equal(pct(0.054), "5.4%");
assert.equal(pct(0.5), "50%");
assert.equal(bars([["x", 2]]).rows[0].text, "2");
assert.deepEqual(cols([1, 2, 3]).labels, ["-2w", "-1w", "now"]);
console.log("admin-stats ok");
