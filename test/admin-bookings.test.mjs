import assert from "node:assert/strict";
import { bookingState, periodProgress, bookingRows, groupBookings, bookingEvents, bookingNow, bookingWidgets, bookingSortValue, countStates, impKey } from "../lib/admin-bookings.js";

const T = "2026-10-19";
assert.equal(bookingState({ status: "approved", startsOn: "2026-10-01", endsOn: "2026-10-31" }, T), "running");
assert.equal(bookingState({ status: "approved", startsOn: "2026-10-25", endsOn: null }, T), "scheduled");
assert.equal(bookingState({ status: "approved", endsOn: "2026-10-18" }, T), "ended");
assert.equal(bookingState({ status: "approved", held: true }, T), "paused");
assert.equal(bookingState({ status: "approved", adminPaused: true, startsOn: "2026-10-25" }, T), "paused");
assert.equal(bookingState({ status: "approved", held: true, endsOn: "2026-10-01" }, T), "ended");
assert.equal(bookingState({ status: "pending" }, T), "waiting");
assert.equal(bookingState({ status: "rejected" }, T), "rejected");
assert.equal(bookingState({ status: "cancelled" }, T), "cancelled");
assert.equal(bookingState({ status: "ended" }, T), "ended");
assert.equal(periodProgress({ startsOn: "2026-10-01", endsOn: "2026-10-31" }, "2026-10-16"), 50);
assert.equal(periodProgress({ startsOn: "2026-10-01", endsOn: null }, T), null);
assert.equal(periodProgress({ startsOn: "2026-11-01", endsOn: "2026-11-30" }, T), 0);

const mk = (id, over = {}) => ({ id, status: "approved", startsOn: "2026-10-01", endsOn: "2026-10-31", created: "2026-09-28", createdAt: "2026-09-28T10:00:00Z", campaign: "Autumn", creativeName: "Summer", category: "retail", creativeUrl: "", creativeSize: "1920 × 1080", game: "Starfall", gameId: "g1", placement: "Lobby", placementId: "p" + id, creativeId: "c1", advertiser: "Nimbus", advertiserId: "a1", developerName: "Kiln", developerId: "d1", dates: "1 Oct to 31 Oct", ...over });
const now = Date.parse("2026-10-19T12:00:00Z");
const imps = new Map([[impKey("p1", "c1"), 100], [impKey("p2", "c1"), 50]]);
const rows = bookingRows({ bookings: [mk("1"), mk("2", { controlNote: "Paused by developer." }), mk("3", { advertiserId: "a2", advertiser: "Pulse", status: "pending" }), mk("4", { developerId: "d2", developerName: "Brick", endsOn: null, dates: "" })], impressions: imps, now });
assert.deepEqual(rows.map((r) => r.state), ["running", "paused", "waiting", "running"]);
assert.equal(rows[0].impressions, 100);
assert.equal(rows[2].impressions, 0);
assert.equal(rows[3].durationDays, 0);
assert.equal(rows[0].progress, 60);
assert.equal(bookingRows({ bookings: [mk("1")], impressions: null, now })[0].impressions, null);

const groups = groupBookings(rows, "pair");
assert.equal(groups[0].title, "Nimbus → Kiln"); // the group with the paused booking comes first
assert.equal(groups[0].counts.paused, 1);
assert.equal(groups[0].impressions, 150);
assert.equal(groups.length, 3);
assert.equal(groupBookings(rows, "none").length, 0);
assert.equal(groupBookings(rows, "game").length, 1);
assert.equal(groupBookings(rows, "developer").length, 2);
const sorted = groupBookings(rows, "pair", { key: "imp", dir: "desc" }, (g, k) => bookingSortValue(g, k, true));
assert.equal(sorted[0].title, "Nimbus → Kiln");
assert.equal(bookingSortValue(rows[0], "period"), "2026-10-01");
assert.deepEqual(countStates(rows), { running: 2, paused: 1, waiting: 1 });

const ev = bookingEvents({ ...rows[0], startedAt: "2026-10-01T00:00:00Z", decidedAt: "2026-09-28T10:05:00Z" }, [{ byName: "Kiln", initiator: "developer", reason: "Misleading", status: "open", created_at: "2026-10-10T00:00:00Z" }]);
assert.deepEqual(ev.map((e) => e.kind), ["adv", "ok", "ok", "report"]);
assert.match(bookingNow(rows[0], 2), /Running\. 100 impressions so far, 60% of the period\. 2 open disputes\./);
assert.match(bookingNow(rows[1]), /^Paused by the developer\. Nothing is shown in the game\./);
assert.match(bookingNow({ ...rows[3], state: "scheduled", from: "2026-11-01" }), /Scheduled/);
const w = bookingWidgets(rows);
assert.equal(w.find((x) => x.k === "bstat").data.items[1].label, "Paused");
assert.equal(w.find((x) => x.k === "bpaused").data.rows[0].label, "Kiln");
assert.equal(w.find((x) => x.k === "bimp").data.rows[0].label, "Starfall");
assert.equal(bookingWidgets(bookingRows({ bookings: [mk("1")], impressions: null, now })).find((x) => x.k === "bimp").data.type, "note");
for (const x of w) assert.ok(/^[a-z0-9_-]{1,12}$/.test(x.k), x.k);
console.log("admin-bookings ok");
