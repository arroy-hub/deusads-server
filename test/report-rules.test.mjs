import assert from "node:assert/strict";
import { creativeSignal, developerOutcome, holdOf, mayReport, signalIsLoud, signalLine, OUTCOME_OF, needsRule, NEUTRAL_BLOCK_REASON, PENDING_BLOCK_REASON } from "../lib/report-rules.js";
import { ADVERTISER_RULES, RULEBOOK, isAdvertiserRule, ruleForReason, rulesLink } from "../lib/platform-rules.js";
import { ART, GUIDE_LIST, guideBySlug, slugOf } from "../lib/home-content.js";
import { disputeRows, disputeEvents, disputeNow, outcomePill } from "../lib/admin-disputes.js";

// the three decisions on a developer's report
assert.deepEqual([OUTCOME_OF.dismiss, OUTCOME_OF.change, OUTCOME_OF.remove], ["dismissed", "changes", "removed"]);
assert.ok(needsRule("change") && needsRule("remove") && !needsRule("dismiss") && !needsRule("pause"));

// what the developer reads
assert.equal(developerOutcome("dismissed").label, "No violation found");
assert.equal(developerOutcome("changes").label, "Change requested");
assert.equal(developerOutcome("removed").label, "Creative removed");
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

console.log("report rules: ok");
