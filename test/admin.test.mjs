// Rules for the admin screens (lib/admin-rules.js). Run: node test/admin.test.mjs
import assert from "node:assert/strict";
import { DECISIONS, ROLES, cleanNote, parseDecision, roleChangeProblem } from "../lib/admin-rules.js";

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
