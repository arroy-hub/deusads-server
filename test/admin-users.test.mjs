import assert from "node:assert/strict";
import { doingNow, userRows, userWidgets, userSortValue } from "../lib/admin-users.js";

assert.equal(doingNow({ role: "developer", games: 0 }), "No games");
assert.equal(doingNow({ role: "developer", games: 1 }), "1 game");
assert.equal(doingNow({ role: "developer", games: 3 }), "3 games");
assert.equal(doingNow({ role: "advertiser", campaigns: 0 }), "No campaigns");
assert.equal(doingNow({ role: "advertiser", campaigns: 2, active: true }), "2 campaigns");
assert.equal(doingNow({ role: "advertiser", campaigns: 1, active: false }), "1 campaign, none running");
assert.equal(doingNow({ role: "admin" }), "Platform admin");

const now = Date.parse("2026-10-19T00:00:00Z");
const accounts = [
  { id: "a", email: "a@x", company: "Alpha", role: "developer", created_at: "2026-10-15T10:00:00Z" },
  { id: "b", email: "b@x", company: "", role: "advertiser", created_at: "2026-08-01T10:00:00Z", suspended_at: "2026-09-01T00:00:00Z" },
  { id: "c", email: "c@x", company: "Root", role: "admin", created_at: "2026-07-01T10:00:00Z" },
  { id: "d", email: "d@x", company: "Dee", role: "developer", created_at: "2026-10-18T10:00:00Z" },
];
const rows = userRows({ accounts, gamesOf: new Map([["a", 2]]), campaignsOf: new Map(), active: new Set(["a"]), selfId: "c", now });
assert.equal(rows[0].doing, "2 games");
assert.equal(rows[0].age, 3);
assert.equal(rows[1].suspended, true);
assert.equal(rows[2].self, true);
assert.equal(userSortValue(rows[1], "status"), 2);
assert.equal(userSortValue(rows[0], "status"), 0);
assert.equal(userSortValue(rows[3], "status"), 1);

const widgets = userWidgets(rows);
const by = Object.fromEntries(widgets.map((w) => [w.k, w.data]));
assert.deepEqual(by.uroles.parts.map((p) => p.value), [2, 1, 1]);
assert.deepEqual(by.ustatus.parts.map((p) => p.value), [1, 2, 1]);
assert.equal(by.unew.items[0].value, "2");
assert.equal(by.uidle.rows[0].value, 1); // developer "d" has no game and is inactive
assert.equal(by.ucomp.items[0].value, "1");
assert.equal(by.usign.values.length, 13);
for (const w of widgets) assert.ok(/^[a-z0-9_-]{1,12}$/.test(w.k), `widget key ${w.k} must fit the layout store`);
console.log("admin-users ok");
