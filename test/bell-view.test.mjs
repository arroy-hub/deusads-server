import assert from "node:assert/strict";
import { forView, sideOfLink } from "../lib/bell-view.js";

assert.equal(sideOfLink("/dashboard/admin/disputes?card=dispute:1"), "admin");
assert.equal(sideOfLink("/dashboard/admin"), "admin");
assert.equal(sideOfLink("/dashboard/creatives/abc"), "advertiser");
assert.equal(sideOfLink("/dashboard/advertising/c/1"), "advertiser");
assert.equal(sideOfLink("/dashboard/wallet"), "advertiser");
assert.equal(sideOfLink("/dashboard/wallet/earnings"), "developer");
assert.equal(sideOfLink("/dashboard/g/1?tab=campaigns"), "developer");
assert.equal(sideOfLink("/dashboard/games"), "developer");
assert.equal(sideOfLink("/dashboard/support?tab=requests&report=9"), "developer");
assert.equal(sideOfLink("/dashboard/support?tab=requests&open=9"), "any");
assert.equal(sideOfLink("/dashboard"), "any");
assert.equal(sideOfLink(null), "any");

const items = [{ id: 1, link: "/dashboard/admin/disputes" }, { id: 2, link: "/dashboard/creatives/x" }, { id: 3, link: "/dashboard/g/1" }, { id: 4, link: "/dashboard" }];
assert.deepEqual(forView(items, "admin").map((i) => i.id), [1, 4]);
assert.deepEqual(forView(items, "advertiser").map((i) => i.id), [2, 4]);
assert.deepEqual(forView(items, "developer").map((i) => i.id), [3, 4]);
assert.deepEqual(forView(null, "admin"), []);
console.log("bell view: ok");
