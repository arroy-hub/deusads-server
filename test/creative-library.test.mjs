import assert from "node:assert/strict";
import { cleanFolderName, cleanFormatCrops, moveInOrder, orderCreatives } from "../lib/creative-library.js";

assert.equal(cleanFolderName("  Summer \n  sale  "), "Summer sale");
assert.equal(cleanFolderName("   "), "");
assert.equal(cleanFolderName(null), "");
assert.equal(cleanFolderName("x".repeat(200)).length, 80);

// own order first, the rest newest first
const rows = [
  { id: "a", sort_index: null, created_at: "2026-10-01" },
  { id: "b", sort_index: 1, created_at: "2026-09-01" },
  { id: "c", sort_index: 0, created_at: "2026-08-01" },
  { id: "d", sort_index: null, created_at: "2026-10-10" },
];
assert.deepEqual(orderCreatives(rows).map((row) => row.id), ["c", "b", "d", "a"]);
assert.deepEqual(rows.map((row) => row.id), ["a", "b", "c", "d"], "the input is not changed");

assert.deepEqual(moveInOrder(["a", "b", "c"], "c", "a"), ["c", "a", "b"], "in front of another");
assert.deepEqual(moveInOrder(["a", "b", "c"], "a", null), ["b", "c", "a"], "to the end");
assert.deepEqual(moveInOrder(["a", "b", "c"], "a", "zzz"), ["b", "c", "a"], "unknown target: to the end");
assert.deepEqual(moveInOrder(["a", "b", "c"], "zzz", "a"), ["a", "b", "c"], "unknown id: unchanged");
assert.deepEqual(moveInOrder(["a", "b", "c"], "b", "b"), ["a", "c", "b"], "in front of itself: to the end");

// framing per shape
assert.equal(cleanFormatCrops(null), null);
assert.equal(cleanFormatCrops([]), null);
assert.equal(cleanFormatCrops({ nonsense: { zoom: 2, x: 0.5, y: 0.5 } }), null, "unknown formats are dropped");
assert.equal(cleanFormatCrops({ r16x9: { zoom: "a", x: 0.5, y: 0.5 } }), null, "broken crops are dropped");
assert.deepEqual(cleanFormatCrops({ r16x9: { zoom: 20, x: 2, y: -1 }, r1x1: { zoom: 1.5, x: 0.25, y: 0.75 } }), {
  r16x9: { zoom: 8, x: 1, y: 0 },
  r1x1: { zoom: 1.5, x: 0.25, y: 0.75 },
}, "values are brought into range");

console.log("creative-library tests passed");
