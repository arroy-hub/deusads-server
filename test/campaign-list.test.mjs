import assert from "node:assert/strict";
import { categoryRank, sortByCategory } from "../lib/campaign-list.js";

// The list order of the categories, not the alphabet: games_apps comes before auto although "Automotive" < "Games and apps".
assert.ok(categoryRank("games_apps") < categoryRank("auto"));
assert.ok(categoryRank("food_drink") < categoryRank("tech"));
assert.equal(categoryRank("unknown_id"), categoryRank("other"));
assert.equal(categoryRank(""), Number.POSITIVE_INFINITY);
assert.equal(categoryRank(undefined), Number.POSITIVE_INFINITY);

const rows = [
  { name: "Zed", category: "auto" },
  { name: "Beta", category: "games_apps" },
  { name: "No category", category: "" },
  { name: "Alpha", category: "games_apps" },
  { name: "Cola", category: "food_drink" },
];
assert.deepEqual(sortByCategory(rows).map((r) => r.name), ["Alpha", "Beta", "Cola", "Zed", "No category"]);
// Reversed: the category list backwards, names backwards inside a category, no category still last.
assert.deepEqual(sortByCategory(rows, "desc").map((r) => r.name), ["Zed", "Cola", "Beta", "Alpha", "No category"]);
// The input is not changed.
assert.equal(rows[0].name, "Zed");
console.log("campaign-list tests passed");
