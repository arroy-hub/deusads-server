// What the dashboard may send when organising placements (lib/placement-input.js).
// Run: node test/placement-input.test.mjs
import assert from "node:assert/strict";
import { changedTags, cleanFolderName, cleanIds, cleanPlaceType, cleanScene, cleanTag, cleanTags, renamedTag } from "../lib/placement-input.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ids
assert.deepEqual(cleanIds([A, B, A, "nope", 5]), [A, B], "distinct and valid only");
assert.equal(cleanIds([]), null);
assert.equal(cleanIds("x"), null);
assert.equal(cleanIds(["nope"]), null);
assert.equal(cleanIds(Array.from({ length: 501 }, (_, i) => `${String(i).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)), null, "too many at once");

// tags
assert.equal(cleanTag("  Hot   deal, \n"), "Hot deal");
assert.equal(cleanTag("x".repeat(60)).length, 30);
assert.deepEqual(cleanTags("wall, Wall ,  , hot"), ["wall", "hot"], "case-insensitive duplicates merge, empties go");
assert.deepEqual(cleanTags(["a", "A", "b"]), ["a", "b"]);
assert.deepEqual(cleanTags(null), []);

// adding and removing
assert.deepEqual(changedTags(["a"], ["b", "A"], []), ["a", "b"]);
assert.deepEqual(changedTags(["a", "b"], [], ["A"]), ["b"], "removal ignores case");
assert.deepEqual(changedTags(["a", "b"], ["c"], ["a"]), ["b", "c"]);
assert.equal(changedTags(Array.from({ length: 20 }, (_, i) => `t${i}`), ["one-more"], []), null, "at most 20 tags on a placement");
assert.equal(changedTags(Array.from({ length: 20 }, (_, i) => `t${i}`), ["one-more"], ["t0"]).length, 20);

// rename and delete a tag
assert.deepEqual(renamedTag(["wall", "hot"], "Wall", "Sign"), ["Sign", "hot"]);
assert.deepEqual(renamedTag(["wall", "sign"], "wall", "Sign"), ["Sign"], "renaming into an existing tag merges");
assert.deepEqual(renamedTag(["wall", "hot"], "wall", ""), ["hot"], "an empty new name deletes the tag");
assert.deepEqual(renamedTag(["hot"], "wall", "Sign"), ["hot"]);

// folder names
assert.equal(cleanFolderName("  Shops \n and   halls "), "Shops and halls");
assert.equal(cleanFolderName("   "), "");
assert.equal(cleanFolderName("y".repeat(200)).length, 80);

// place type
assert.deepEqual(cleanPlaceType(null), { value: null });
assert.deepEqual(cleanPlaceType("  "), { value: null });
assert.deepEqual(cleanPlaceType(" Boss  arena "), { value: "Boss arena" });
assert.match(cleanPlaceType("z".repeat(41)).error, /at most 40/);

// scene
assert.equal(cleanScene(" Level_3 "), "Level_3");
assert.equal(cleanScene(""), null);
assert.equal(cleanScene(7), null);
assert.equal(cleanScene("s".repeat(201)), null);

console.log("placement input: all checks passed");
