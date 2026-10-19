import assert from "node:assert/strict";
import { reviewRows, creativeEvents, reviewWidgets, reasonKey, isRestricted } from "../lib/admin-review.js";

const now = Date.parse("2026-10-19T12:00:00Z");
const urlOf = (p) => `https://cdn/${p}`;
const creatives = [
  { id: "1", name: "Summer", storage_path: "a.png", owner_id: "o1", accounts: { company: "Nimbus", email: "n@x" }, ad_category: "retail", width_px: 1920, height_px: 1080, created_at: "2026-10-17T12:00:00Z", status: "pending" },
  { id: "2", name: "Spin", storage_path: "b.png", owner_id: "o2", accounts: { company: null, email: "r@x" }, ad_category: "gambling", width_px: 1200, height_px: 400, created_at: "2026-10-14T12:00:00Z", status: "rejected", review_note: "Gambling is not accepted.", reviewed_at: "2026-10-14T18:00:00Z" },
  { id: "3", name: "Cola", storage_path: "c.png", owner_id: "o3", accounts: { company: "Zero", email: "z@x" }, ad_category: "food_drink", created_at: "2026-10-15T12:00:00Z", status: "approved", reviewed_at: "2026-10-15T14:00:00Z" },
];
const { creatives: rows } = reviewRows({ creatives, urlOf, now });
assert.equal(rows[0].out, "waiting");
assert.equal(rows[0].age, 2);
assert.equal(rows[0].hoursWaiting, 48);
assert.equal(rows[0].size, "1920 × 1080");
assert.equal(rows[1].restricted, true);
assert.equal(rows[1].owner, "r@x");
assert.equal(rows[1].hrs, 6);
assert.equal(rows[2].size, "—");
assert.equal(rows[2].url, "https://cdn/c.png");
assert.equal(isRestricted("retail"), false);
assert.equal(reasonKey(" Gambling is not accepted. "), "gambling is not accepted");

const w = Object.fromEntries(reviewWidgets(rows).map((x) => [x.k, x.data]));
assert.equal(w.r_queue.items[0].value, "1");
assert.equal(w.r_queue.items[1].warn, true); // 48 h waiting
assert.deepEqual(w.r_out.parts.map((p) => p.value), [1, 1, 1]);
assert.equal(w.r_reasons.rows[0].label, "Gambling is not accepted");
assert.equal(w.r_rate.rows[0].text, "100% of 1");
assert.equal(w.r_time.items[0].value, "2.0 h");
assert.equal(w.r_week.values.length, 13);
assert.deepEqual(reviewWidgets([]).find((x) => x.k === "r_time").data.items[0].value, "—");

const ev = creativeEvents({ row: rows[1], bookings: [], disputes: [{ byName: "Kiln", reason: "Gambling", gameName: "Starfall", status: "resolved", outcome: "removed", created_at: "2026-10-16T00:00:00Z" }] });
assert.deepEqual(ev.map((e) => e.kind), ["adv", "bad", "report"]);
assert.equal(creativeEvents({ row: rows[0] }).at(-1).kind, "sys"); // waiting entry sorts last
for (const x of reviewWidgets(rows)) assert.ok(/^[a-z0-9_-]{1,12}$/.test(x.k), x.k);
console.log("admin-review ok");
