import assert from "node:assert/strict";
import { nextSort, sortRows, ariaSort } from "../lib/sort.js";

assert.deepEqual(nextSort(null, "a"), { key: "a", dir: "asc" });
assert.deepEqual(nextSort({ key: "a", dir: "asc" }, "a"), { key: "a", dir: "desc" });
assert.equal(nextSort({ key: "a", dir: "desc" }, "a"), null);
assert.deepEqual(nextSort(null, "n", { n: "desc" }), { key: "n", dir: "desc" });
assert.deepEqual(nextSort({ key: "n", dir: "desc" }, "n", { n: "desc" }), { key: "n", dir: "asc" });
assert.equal(nextSort({ key: "n", dir: "asc" }, "n", { n: "desc" }), null);
assert.deepEqual(nextSort({ key: "a", dir: "asc" }, "b"), { key: "b", dir: "asc" });

const rows = [{ n: "b", v: 2 }, { n: "", v: 5 }, { n: "A", v: 9 }, { n: "c", v: null }];
assert.deepEqual(sortRows(rows, null), rows);
assert.deepEqual(sortRows(rows, { key: "n", dir: "asc" }).map((r) => r.n), ["A", "b", "c", ""]);
assert.deepEqual(sortRows(rows, { key: "n", dir: "desc" }).map((r) => r.n), ["c", "b", "A", ""]);
assert.deepEqual(sortRows(rows, { key: "v", dir: "desc" }).map((r) => r.v), [9, 5, 2, null]);
assert.equal(ariaSort({ key: "a", dir: "desc" }, "a"), "descending");
assert.equal(ariaSort(null, "a"), "none");
console.log("sort ok");
