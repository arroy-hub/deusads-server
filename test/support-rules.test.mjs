// The rules of the support system. Run: node test/support-rules.test.mjs
import assert from "node:assert/strict";
import {
  allowedStatuses, assistantRateProblem, bulkAllowed, canSetStatus, changeType, cleanFolderName, cleanRequest,
  groupByPerson, lockOf, requestRateProblem, screenshotKind, screenshotProblem, statusAfterMessage, toneOf, waitLabel,
} from "../lib/support-rules.js";

// statuses by type: noted only for ideas, resolved never for ideas
assert.deepEqual(allowedStatuses("idea"), ["new", "answered", "noted"]);
assert.deepEqual(allowedStatuses("bug"), ["new", "answered", "resolved"]);
assert.deepEqual(allowedStatuses("question"), ["new", "answered", "resolved"]);
assert.equal(canSetStatus("idea", "resolved"), false);
assert.equal(canSetStatus("bug", "noted"), false);
assert.equal(canSetStatus("bug", "resolved"), true);

// locks: resolved closes everything for the person (with a follow-up offer); a noted idea closes without one
assert.equal(lockOf({ type: "bug", status: "answered" }), null);
assert.equal(lockOf({ type: "idea", status: "answered" }), null);
assert.equal(lockOf({ type: "bug", status: "resolved" }).followUp, true);
assert.equal(lockOf({ type: "idea", status: "noted" }).followUp, false);

// an admin reply answers at once, also a resolved request; a note changes nothing; a user reply on answered → new
assert.equal(statusAfterMessage({ status: "new" }, { from: "admin" }), "answered");
assert.equal(statusAfterMessage({ status: "resolved" }, { from: "admin" }), "answered");
assert.equal(statusAfterMessage({ status: "resolved" }, { from: "admin", note: true }), "resolved");
assert.equal(statusAfterMessage({ status: "answered" }, { from: "user" }), "new");
assert.equal(statusAfterMessage({ status: "new" }, { from: "user" }), "new");

// changing the type never changes the status
const resolved = { type: "bug", status: "resolved" };
assert.deepEqual(changeType(resolved, "idea"), { type: "idea", status: "resolved" });
assert.equal(changeType(resolved, "nonsense"), null);
assert.equal(canSetStatus("idea", "resolved"), false); // ... but it cannot be *set* on an idea

// colour: by type, resolved is always green
assert.equal(toneOf({ type: "bug", status: "new" }), "ans");
assert.equal(toneOf({ type: "idea", status: "noted" }), "sched");
assert.equal(toneOf({ type: "question", status: "answered" }), "sched");
assert.equal(toneOf({ type: "bug", status: "resolved" }), "live");

// people: the longest wait first, people without a waiting request after; ordering inside a person, not filtering
const now = Date.parse("2026-10-27T12:00:00Z");
const ago = (h) => new Date(now - h * 3600000).toISOString();
const reqs = [
  { id: 1, owner_id: "a", owner_name: "Anna", type: "bug", status: "new", created_at: ago(3) },
  { id: 2, owner_id: "b", owner_name: "Boris", type: "bug", status: "new", created_at: ago(50) },
  { id: 3, owner_id: "b", owner_name: "Boris", type: "idea", status: "noted", created_at: ago(10) },
  { id: 4, owner_id: "c", owner_name: "Cleo", type: "question", status: "resolved", created_at: ago(1) },
  { id: 5, owner_id: "a", owner_name: "Anna", type: "idea", status: "answered", created_at: ago(70) },
];
let people = groupByPerson(reqs, { now });
assert.deepEqual(people.map((p) => p.name), ["Boris", "Anna", "Cleo"]);
assert.equal(people[0].items.length, 2); // nothing is filtered out
assert.deepEqual(people[1].items.map((r) => r.id), [1, 5]); // new first inside Anna
people = groupByPerson(reqs, { now, inner: "resolved" });
assert.equal(people.find((p) => p.name === "Cleo").items[0].id, 4);
assert.deepEqual(groupByPerson(reqs, { now, sort: "count" }).map((p) => p.name).slice(0, 2), ["Boris", "Anna"]) /* tie: longer wait first */;
assert.deepEqual(groupByPerson(reqs, { now, sort: "name" }).map((p) => p.name), ["Anna", "Boris", "Cleo"]);

// bulk actions
assert.deepEqual(bulkAllowed([]), { resolve: false, note: false, send: false });
assert.deepEqual(bulkAllowed([{ type: "bug" }, { type: "question" }]), { resolve: true, note: false, send: true });
assert.deepEqual(bulkAllowed([{ type: "idea" }]), { resolve: false, note: true, send: true });
assert.deepEqual(bulkAllowed([{ type: "idea" }, { type: "bug" }]), { resolve: false, note: false, send: true });

// cleaning
assert.ok(cleanRequest({ type: "x", title: "a", text: "b" }).error);
assert.ok(cleanRequest({ type: "bug", title: " ", text: "" }).error);
assert.equal(cleanRequest({ type: "bug", title: "", text: "Banners   don't show" }).title, "Banners don't show");
assert.equal(cleanRequest({ type: "idea", title: "T".repeat(300), text: "x" }).title.length, 140);
assert.equal(cleanFolderName("  My   folder "), "My folder");
assert.equal(cleanFolderName("   "), null);

// limits: 5 requests an hour, 30 assistant messages a day
assert.equal(requestRateProblem(4), null);
assert.ok(requestRateProblem(5));
assert.equal(assistantRateProblem(29), null);
assert.ok(assistantRateProblem(30));

// screenshots are judged by their bytes
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
assert.equal(screenshotKind(png), "png");
assert.equal(screenshotKind(jpg), "jpg");
assert.equal(screenshotKind(webp), "webp");
assert.equal(screenshotKind(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
assert.equal(screenshotProblem({ size: png.length, bytes: png }), null);
assert.ok(screenshotProblem({ size: 6 * 1024 * 1024, bytes: png }));
assert.ok(screenshotProblem({ size: 0, bytes: png }));

assert.equal(waitLabel(0.2), "12 min");
assert.equal(waitLabel(5), "5 h");
assert.equal(waitLabel(72), "3 d");

console.log("support rules ok");
