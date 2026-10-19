import assert from "node:assert/strict";
import { trafficTable } from "../lib/traffic.js";
import { trafficWidgets } from "../lib/admin-traffic.js";

const t = trafficTable([
  { game_id: "a", game_name: "A", views: 1000, flagged: 300, behind: 300 },
  { game_id: "b", game_name: "B", views: 1000, flagged: 60, no_time: 60 },
  { game_id: "c", game_name: "C", views: 10, flagged: 2, future: 2 },
  { game_id: "d", game_name: "D", views: 500, flagged: 0 },
]);
const w = Object.fromEntries(trafficWidgets(t).map((x) => [x.k, x]));
assert.equal(w.t_sum.data.items[1].value, "362");
assert.deepEqual(w.t_lv.data.parts.map((p) => p.value), [1, 1, 1, 1]);
assert.equal(w.t_share.data.rows[0].label, "A");
assert.equal(w.t_share.data.rows.length, 2, "a game with too few views is left out");
assert.equal(w.t_rule.data.rows[0].label, "Seen from behind");
console.log("admin-traffic ok");
