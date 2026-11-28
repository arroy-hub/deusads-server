import assert from "node:assert/strict";
import { pictureHoldOf, creativeSignal, developerOutcome, holdOf, mayReport, signalIsLoud, signalLine, OUTCOME_OF, needsRule, NEUTRAL_BLOCK_REASON, PENDING_BLOCK_REASON } from "../lib/report-rules.js";
import { ADVERTISER_RULES, RULEBOOK, isAdvertiserRule, ruleForReason, rulesLink } from "../lib/platform-rules.js";
import { ART, GUIDE_LIST, guideBySlug, slugOf } from "../lib/home-content.js";
import { disputeRows, disputeEvents, disputeNow, outcomePill } from "../lib/admin-disputes.js";

// the three decisions on a developer's report
assert.deepEqual([OUTCOME_OF.dismiss, OUTCOME_OF.change, OUTCOME_OF.remove], ["dismissed", "changes", "removed"]);
assert.ok(needsRule("change") && needsRule("remove") && !needsRule("dismiss") && !needsRule("pause"));

// what the developer reads
assert.equal(developerOutcome("dismissed").label, "No violation found");
assert.equal(developerOutcome("changes").label, "Change requested");
assert.equal(developerOutcome("removed").label, "Picture removed");
assert.equal(developerOutcome("open").label, "In review");
assert.match(developerOutcome("dismissed").text, /up to you/);

// one decision per picture, until the picture changes
assert.equal(mayReport(null, null), true);
assert.equal(mayReport({ status: "open" }, "2026-12-01T00:00:00Z"), false);
assert.equal(mayReport({ status: "dismissed", resolvedAt: "2026-11-20T10:00:00Z" }, "2026-11-01T00:00:00Z"), false, "nothing changed since the decision");
assert.equal(mayReport({ status: "dismissed", resolvedAt: "2026-11-20T10:00:00Z" }, null), false);
assert.equal(mayReport({ status: "changes", resolvedAt: "2026-11-20T10:00:00Z" }, "2026-11-25T00:00:00Z"), true, "a new version may be reported");

// the signal: one block per game counts, the pending reason reads neutral, who blocked is not in it
const signal = creativeSignal({
  games: ["g1", "g2", "g3", "g4", "g5"],
  blocks: [{ gameId: "g1", reason: "Low picture quality" }, { gameId: "g1", reason: "Other" }, { gameId: "g2", reason: PENDING_BLOCK_REASON }, { gameId: "g9", reason: "" }],
  reports: [{ status: "dismissed" }, { status: "dismissed" }],
});
assert.equal(signal.games, 6, "a game that blocks it is a game it was in");
assert.equal(signal.blocked, 3);
assert.deepEqual(signal.reasons.map((r) => r[0]).sort(), [NEUTRAL_BLOCK_REASON, "Low picture quality", "No reason given"].sort());
assert.equal(signalLine(signal), "Blocked in 3 of 6 games · 2 reports, no violation found");
assert.equal(signalLine(creativeSignal({ games: ["g1"] })), "");
assert.equal(signalIsLoud({ blocked: 3, games: 15 }), true);
assert.equal(signalIsLoud({ blocked: 3, games: 16 }), false, "under a fifth of the games");
assert.equal(signalIsLoud({ blocked: 2, games: 2 }), false, "fewer than three games");

// a creative on hold, as its advertiser reads it
assert.equal(holdOf({ status: "approved" }), null);
assert.equal(holdOf({ hold: "changes", status: "rejected", hold_rule: "Ads must be truthful", hold_note: "Fix it" }).pill[0], "Needs changes");
assert.equal(holdOf({ hold: "changes", status: "pending" }).pill[0], "In review");
assert.equal(holdOf({ hold: "blocked", status: "rejected" }).pill[0], "Blocked");

// the rules: what an admin picks from is what the guide says
assert.equal(ADVERTISER_RULES.length, 9);
assert.equal(RULEBOOK.dev.rules.length, 7);
assert.ok(isAdvertiserRule(ruleForReason("Wrong category")) && ruleForReason("Wrong category").includes("category"));
assert.ok(isAdvertiserRule(ruleForReason("anything else")));
assert.ok(!isAdvertiserRule("made up"));
for (const role of ["dev", "adv"]) {
  const guide = guideBySlug(rulesLink(role).split("/").pop());
  assert.equal(guide?.title, RULEBOOK[role].title, "the rules link opens the rules");
  assert.ok(ART[RULEBOOK[role].title].rules);
  assert.ok(GUIDE_LIST[role].includes(RULEBOOK.dev.title) && GUIDE_LIST[role].includes(RULEBOOK.adv.title), "both sides can read both");
  assert.equal(slugOf(RULEBOOK[role].title), rulesLink(role).split("/").pop());
}
for (const text of JSON.stringify(RULEBOOK)) assert.ok(text.charCodeAt(0) < 0x400 || text.charCodeAt(0) > 0x4ff, "no Cyrillic");

// the admin's history of a decided report
const base = { id: "d1", game_id: "g", developer_id: "dev", creative_id: "c", reason: "Wrong category", status: "resolved", created_at: "2026-11-27T16:20:00Z", resolved_at: "2026-11-28T11:40:00Z", byName: "Pixel Forge", againstName: "Northwind", gameName: "Neon Drift VR", creativeName: "Citrus splash" };
const [changes] = disputeRows([{ ...base, outcome: "changes", rule: ADVERTISER_RULES[1], adv_note: "Remove the energy claim.", dev_note: "Thanks.", held: "changes" }]);
assert.equal(changes.status, "changes");
assert.deepEqual(outcomePill(changes), ["Change requested", "warn"]);
assert.match(disputeNow(changes), /No new version/);
const step = disputeEvents(changes, [], {}).find((e) => e.text.startsWith("Asked the advertiser"));
assert.deepEqual(Object.fromEntries(step.facts)["To the advertiser"], "Remove the energy claim.");
assert.equal(Object.fromEntries(step.facts)["Rule involved"], ADVERTISER_RULES[1]);
assert.equal(Object.fromEntries(step.facts)["To the developer"], "Thanks.");
const [clean] = disputeRows([{ ...base, outcome: "dismissed" }]);
assert.deepEqual(outcomePill(clean), ["No violation", "good"]);
assert.ok(disputeEvents(clean, [], {}).some((e) => e.text === "Found no violation"));
assert.deepEqual(outcomePill(disputeRows([{ ...base, initiator: "advertiser", outcome: "dismissed" }])[0]), ["Dismissed", "good"]);
const [blocked] = disputeRows([{ ...base, outcome: "removed", rule: ADVERTISER_RULES[0], adv_note: "No such discount." }]);
assert.equal(Object.fromEntries(disputeEvents(blocked, [], {}).find((e) => e.text.startsWith("Blocked the creative")).facts)["Rule broken"], ADVERTISER_RULES[0]);
const open = disputeRows([{ ...base, status: "open", outcome: null, resolved_at: null }])[0];
assert.ok(disputeEvents(open, [], { others: "Blocked by developers in 5 other games · no other reports" })[0].facts.some(([k]) => k === "Other games"));

// the conversation after a decision, and a decision taken back, in the admin's history
const talk = disputeEvents({ ...changes, waiting: true }, [
  { side: "advertiser", kind: "reply", text: "Which word exactly?", created_at: "2026-11-28T12:00:00Z", who: "Northwind" },
  { side: "admin", kind: "reply", text: "The word ENERGY on the can.", created_at: "2026-11-28T12:30:00Z", who: "DeusADS admin" },
  { side: "admin", kind: "decision", text: "withdrawn: Change requested · The ad belongs to the category it was booked in", created_at: "2026-11-28T13:00:00Z", who: "DeusADS admin" },
], { advEmail: "media@northwind.example" });
assert.ok(talk.some((e) => e.kind === "adv" && e.text === "Replied: Which word exactly?"));
const answer = talk.find((e) => e.text.startsWith("Replied to the advertiser"));
assert.equal(Object.fromEntries(answer.facts).To, "Northwind · media@northwind.example");
assert.match(Object.fromEntries(talk.find((e) => e.text.startsWith("Took the decision back")).facts)["Decision taken back"], /^Change requested/);
assert.match(disputeNow(disputeRows([{ ...base, outcome: "removed", waiting: true, held: "blocked", heldHere: true }])[0]), /waits for an answer/);

// a report stops the reported picture, not the creative (migration 0065)
const pictureHold = pictureHoldOf({ creative_id: "c", shape: "r16x9", kind: "changes", rule: ADVERTISER_RULES[1], note: "Fix it", dispute_id: "d1", held_at: "2026-11-28T11:40:00Z", sent_at: null }, "16:9");
assert.deepEqual(pictureHold.pill, ["16:9 needs changes", "ov-warn"]);
assert.match(pictureHold.line, /Other shapes keep running/);
assert.equal(pictureHold.disputeId, "d1");
assert.equal(pictureHoldOf({ shape: "r16x9", kind: "changes", sent_at: "2026-11-29T00:00:00Z" }, "16:9").pill[0], "16:9 in review");
assert.equal(pictureHoldOf({ shape: "r1x1", kind: "blocked" }, "1:1").pill[0], "1:1 blocked");
assert.equal(pictureHoldOf(null, "1:1"), null);
const { heldTest } = await import("../lib/creative-reports.js").catch(() => ({ heldTest: null }));
if (heldTest) {
  const held = heldTest([{ creative_id: "c", shape: "r16x9", kind: "changes" }]);
  assert.equal(held("c", "r16x9").kind, "changes");
  assert.equal(held("c", "r1x1"), null, "another shape of the same creative is free");
  assert.equal(held("c", null), null);
}
const [shaped] = disputeRows([{ ...base, shape: "r16x9", shapeLabel: "16:9", outcome: "changes", rule: ADVERTISER_RULES[1], adv_note: "x", held: "changes", heldHere: true }]);
assert.match(disputeNow(shaped), /other shapes keep running/);
assert.ok(disputeEvents(shaped, [], {}).some((e) => e.text === "Asked the advertiser to change the picture"));

// a new picture sent for a held shape is reviewed in its dispute, which is open work again
const [again] = disputeRows([{ ...base, shape: "x2.3", shapeLabel: "21:9", outcome: "changes", held: "changes", heldHere: true, resent: true, newPicture: { id: "a1", url: "u", size: "1642 × 707", at: "2026-11-28T13:15:38Z" } }]);
assert.equal(again.needsAction, true);
assert.equal(disputeRows([{ ...base, outcome: "changes", held: "changes", heldHere: true }])[0].needsAction, false);
assert.equal(disputeRows([{ ...base, outcome: "changes", waiting: true }])[0].needsAction, true, "an advertiser waiting for a reply");
assert.ok(disputeEvents(again, [], {}).some((e) => e.text === "Uploaded a new 21:9 picture for review"), "also for a picture sent before uploads were recorded");
const reviewed = disputeEvents(again, [
  { side: "advertiser", kind: "decision", text: "picture: uploaded 1642 × 707", created_at: "2026-11-28T13:15:39Z", who: "Northwind" },
  { side: "admin", kind: "decision", text: "picture: rejected: still offensive", created_at: "2026-11-28T14:00:00Z", who: "DeusADS admin" },
], {});
assert.equal(reviewed.filter((e) => e.text.startsWith("Uploaded a new")).length, 1, "the recorded upload is not shown twice");
assert.ok(reviewed.some((e) => e.text === "Did not approve the new 21:9 picture: still offensive"));

console.log("report rules: ok");
