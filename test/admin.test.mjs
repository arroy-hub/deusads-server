// Rules for the admin screens (lib/admin-rules.js). Run: node test/admin.test.mjs
import assert from "node:assert/strict";
import { activeAccountIds, newUserProblem, canAdvertise, DECISIONS, ROLES, cleanNote, parseDecision, roleChangeProblem } from "../lib/admin-rules.js";

assert.deepEqual(ROLES, ["developer", "advertiser", "admin"]);
assert.deepEqual(DECISIONS, ["approved", "rejected"]);

// only the two real decisions pass; "pending" and anything odd is refused
assert.equal(parseDecision("approved"), "approved");
assert.equal(parseDecision("rejected"), "rejected");
for (const bad of ["pending", "draft", "APPROVED", "", null, undefined, 1, {}, ["approved"]]) {
  assert.equal(parseDecision(bad), null, `refused: ${JSON.stringify(bad)}`);
}

// notes are trimmed, capped and never empty strings
assert.equal(cleanNote("  too dark  "), "too dark");
assert.equal(cleanNote("   "), null);
assert.equal(cleanNote(null), null);
assert.equal(cleanNote(undefined), null);
assert.equal(cleanNote("x".repeat(900)).length, 500);

// role changes
assert.equal(roleChangeProblem({ actorId: "a", targetId: "b", role: "advertiser" }), null);
assert.equal(roleChangeProblem({ actorId: "a", targetId: "b", role: "admin" }), null);
assert.equal(roleChangeProblem({ actorId: "a", targetId: "b", role: "developer" }), null);
assert.match(roleChangeProblem({ actorId: "a", targetId: "a", role: "developer" }), /own role/);
assert.match(roleChangeProblem({ actorId: "a", targetId: "a", role: "admin" }), /own role/);
assert.match(roleChangeProblem({ actorId: "a", targetId: "b", role: "superuser" }), /Unknown role/);
assert.match(roleChangeProblem({ actorId: "a", targetId: "b", role: undefined }), /Unknown role/);
assert.match(roleChangeProblem({ actorId: "a", targetId: "", role: "admin" }), /Unknown account/);

console.log("admin: all checks passed");

// who may use the advertiser tools: advertisers, and admins so one account can try both sides
assert.ok(canAdvertise("advertiser") && canAdvertise("admin") && !canAdvertise("developer") && !canAdvertise(undefined));
console.log("advertiser access ok");

// creating a user from the admin screen
const ok = { email: "a@b.co", password: "12345678", role: "developer" };
assert.equal(newUserProblem(ok), null);
assert.equal(newUserProblem({ ...ok, role: "admin" }), null);
assert.match(newUserProblem({ ...ok, email: "nope" }), /valid email/);
assert.match(newUserProblem({ ...ok, email: "a b@c.de" }), /valid email/);
assert.match(newUserProblem({ ...ok, password: "1234567" }), /at least 8/);
assert.match(newUserProblem({ ...ok, role: "owner" }), /role/);

// active = owns a game, or has a campaign running today
const today = "2026-10-11";
const active = activeAccountIds(["dev1"], [
  { advertiser_id: "adv-live", status: "approved", starts_on: null, ends_on: null },
  { advertiser_id: "adv-dated", status: "approved", starts_on: "2026-10-01", ends_on: "2026-10-11" },
  { advertiser_id: "adv-future", status: "approved", starts_on: "2026-10-12", ends_on: null },
  { advertiser_id: "adv-ended", status: "approved", starts_on: null, ends_on: "2026-10-10" },
  { advertiser_id: "adv-waiting", status: "pending", starts_on: null, ends_on: null },
  { advertiser_id: "adv-stopped", status: "cancelled", starts_on: null, ends_on: null },
], today);
assert.deepEqual([...active].sort(), ["adv-dated", "adv-live", "dev1"]);
console.log("users rules ok");
