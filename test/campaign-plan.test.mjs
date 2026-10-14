import assert from "node:assert/strict";
import { addToPlan, planCreativeIds, removeFromPlan } from "../lib/campaign-plan.js";

assert.deepEqual(planCreativeIds(null), []);
assert.deepEqual(planCreativeIds({ creativeId: "a" }), ["a"]);
assert.deepEqual(planCreativeIds({ creativeId: "a", moreCreativeIds: ["b", "a", "", 7] }), ["a", "b"], "no repeats, no junk");
assert.deepEqual(planCreativeIds({ creativeId: "", moreCreativeIds: ["b"] }), ["b"]);

const plan = { creativeId: "a", mode: "audience", launched: true, startsOn: "", endsOn: "" };
const more = addToPlan(plan, ["b", "c", "a"]);
assert.deepEqual(planCreativeIds(more), ["a", "b", "c"]);
assert.equal(more.mode, "audience", "the rest of the plan is kept");
assert.equal(addToPlan({}, ["x"]).creativeId, "x", "the first creative added becomes the main one");

const less = removeFromPlan(more, "a");
assert.equal(less.creativeId, "b", "the next creative takes over");
assert.deepEqual(less.moreCreativeIds, ["c"]);
assert.equal(removeFromPlan({ creativeId: "a" }, "a").creativeId, "", "nothing left");
assert.deepEqual(planCreativeIds(removeFromPlan(more, "zzz")), ["a", "b", "c"], "unknown id: unchanged");

console.log("campaign-plan tests passed");
