import assert from "node:assert/strict";
import { cleanLayout, DECK_KINDS, isDeckKind } from "../lib/deck-layout.js";

assert.deepEqual(DECK_KINDS, ["developer", "advertiser"]);
assert.deepEqual(cleanLayout(null), { open: false, sel: null, sizes: {} });
assert.deepEqual(cleanLayout("x"), { open: false, sel: null, sizes: {} });

const ok = cleanLayout({ open: true, sel: ["ring", "rep", "ring", 5, "BAD KEY", "pl"], sizes: { rep: { w: 99, h: 5 }, freq: { w: 6.4 }, "no way": { w: 4 }, x: "y", fun: {} } });
assert.equal(ok.open, true);
assert.deepEqual(ok.sel, ["ring", "rep", "pl"]);
assert.deepEqual(ok.sizes, { rep: { w: 12, h: 60 }, freq: { w: 6 } });
assert.equal(cleanLayout({ open: "yes" }).open, false);
assert.equal(cleanLayout({ sel: "ring" }).sel, null);
assert.equal(cleanLayout({ sel: Array.from({ length: 100 }, (_, i) => `k${i}`) }).sel.length, 40);
assert.equal(isDeckKind("admin_users"), true);
assert.equal(isDeckKind("admin_"), false);
assert.equal(isDeckKind("admin_x;drop"), false);
assert.equal(isDeckKind("developer"), true);
assert.equal(isDeckKind("other"), false);
console.log("deck-layout ok");
