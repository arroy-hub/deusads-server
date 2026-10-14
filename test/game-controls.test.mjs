// Rules for pausing and blocking ads in one game. Run: node test/game-controls.test.mjs
import assert from "node:assert/strict";
import {
  CHANGE_LIMIT, controlNote, blockedCategories, bulkKeyOf, campaignState, changeMessage, controlMap, mayServe, nextControl, planChange,
} from "../lib/game-controls.js";

// categories: restricted ones are blocked unless a row says otherwise
assert.deepEqual([...blockedCategories([])].sort(), ["alcohol_tobacco", "dating_adult", "gambling"]);
assert.ok(!blockedCategories([{ category: "gambling", blocked: false }]).has("gambling"));
assert.ok(blockedCategories([{ category: "retail", blocked: true }]).has("retail"));

const controls = controlMap([
  { scope: "campaign", target_id: "c1", state: "paused", reason: "r" },
  { scope: "campaign", target_id: "c2", state: "blocked", reason: "bad" },
  { scope: "creative", target_id: "cr9", state: "blocked" },
  { scope: "advertiser", target_id: "adv3", state: "blocked", reason: "no" },
]);
const ctx = { controls, blocked: blockedCategories([]) };

// campaign state: advertiser block first, then own block, then category, then pause
assert.equal(campaignState({ campaignId: "c1", advertiserId: "a", category: "retail", base: "active" }, ctx).key, "paused");
assert.equal(campaignState({ campaignId: "c2", advertiserId: "a", category: "retail", base: "active" }, ctx).key, "blocked");
assert.equal(campaignState({ campaignId: "c4", advertiserId: "adv3", category: "retail", base: "active" }, ctx).key, "blockedadv");
assert.equal(campaignState({ campaignId: "c4", advertiserId: "a", category: "gambling", base: "active" }, ctx).key, "blockedcat");
assert.equal(campaignState({ campaignId: "c4", advertiserId: "a", category: "retail", base: "waiting" }, ctx).key, "waiting");
// the advertiser paused the whole campaign: the developer sees it as paused by the advertiser, an ended one stays ended
assert.equal(campaignState({ campaignId: "c4", advertiserId: "a", category: "retail", base: "active", advertiserPaused: true }, ctx).key, "advpaused");
assert.equal(campaignState({ campaignId: "c4", advertiserId: "a", category: "retail", base: "ended", advertiserPaused: true }, ctx).key, "ended");
assert.equal(campaignState({ campaignId: "c2", advertiserId: "a", category: "retail", base: "active", advertiserPaused: true }, ctx).key, "blocked");

// serving
const ok = { source: "booking", campaignId: "c4", advertiserId: "a", creativeId: "x", category: "retail" };
assert.equal(mayServe(ok, ctx), true);
assert.equal(mayServe({ ...ok, source: "own", campaignId: "c1" }, ctx), true, "own pictures always serve");
assert.equal(mayServe({ ...ok, campaignId: "c1" }, ctx), false);
assert.equal(mayServe({ ...ok, campaignId: "c2" }, ctx), false);
assert.equal(mayServe({ ...ok, creativeId: "cr9" }, ctx), false);
assert.equal(mayServe({ ...ok, advertiserId: "adv3" }, ctx), false);
assert.equal(mayServe({ ...ok, category: "gambling" }, ctx), false);

// planning
const now = Date.parse("2026-10-12T12:00:00Z");
const ago = (min) => new Date(now - min * 60000).toISOString();
const free = [{ id: "a", state: "free" }];
assert.deepEqual(planChange({ action: "pause", scope: "campaign", targets: free, now }).apply, ["a"]);
// already paused: a duplicate, not saved
assert.deepEqual(planChange({ action: "pause", scope: "campaign", targets: [{ id: "a", state: "paused" }], now }).duplicates, ["a"]);
assert.deepEqual(planChange({ action: "resume", scope: "campaign", targets: free, now }).duplicates, ["a"]);
// block from paused is fine; block when blocked is a duplicate
assert.deepEqual(planChange({ action: "block", scope: "campaign", targets: [{ id: "a", state: "paused" }], now }).apply, ["a"]);
assert.deepEqual(planChange({ action: "block", scope: "campaign", targets: [{ id: "a", state: "blocked" }], now }).duplicates, ["a"]);
// limit: two changes in the last hour stop the third; older ones do not count
const two = [{ target_id: "a", created_at: ago(10) }, { target_id: "a", created_at: ago(50) }];
assert.deepEqual(planChange({ action: "pause", scope: "campaign", targets: free, recent: two, now }).limited, ["a"]);
const old = [{ target_id: "a", created_at: ago(10) }, { target_id: "a", created_at: ago(70) }];
assert.deepEqual(planChange({ action: "pause", scope: "campaign", targets: free, recent: old, now }).apply, ["a"]);
// bulk changes do not use up an item's own limit
const inBulk = [{ target_id: "a", batch_id: "b1", created_at: ago(5) }, { target_id: "a", batch_id: "b2", created_at: ago(6) }];
assert.deepEqual(planChange({ action: "pause", scope: "campaign", targets: free, recent: inBulk, now }).apply, ["a"]);
// the same bulk change twice an hour at most
const three = [{ id: "a", state: "free" }, { id: "b", state: "free" }];
const key = bulkKeyOf("pause", "campaign", ["b", "a"]);
assert.equal(key, bulkKeyOf("pause", "campaign", ["a", "b"]));
const bulkLog = [
  { target_id: "a", batch_id: "x1", bulk_key: key, created_at: ago(5) },
  { target_id: "b", batch_id: "x1", bulk_key: key, created_at: ago(5) },
  { target_id: "a", batch_id: "x2", bulk_key: key, created_at: ago(9) },
];
const planned = planChange({ action: "pause", scope: "campaign", targets: three, recent: bulkLog, now });
assert.equal(planned.bulkLimited, true);
assert.deepEqual(planned.apply, []);
assert.equal(planChange({ action: "pause", scope: "campaign", targets: three, recent: bulkLog.slice(0, 2), now }).bulkLimited, false);

// controls after an action
assert.deepEqual(nextControl("pause"), { state: "paused" });
assert.deepEqual(nextControl("block"), { state: "blocked" });
assert.equal(nextControl("resume"), null);
assert.equal(nextControl("unblock"), null);

// messages
assert.match(changeMessage({ action: "pause", scope: "campaign", applied: 1, names: ["Spring"] }), /Paused campaign "Spring" in this game only/);
assert.match(changeMessage({ action: "block", scope: "creative", applied: 3 }), /Blocked 3 creatives.*Saved as one record/);
assert.match(changeMessage({ action: "pause", scope: "campaign", applied: 0, limited: 1 }), /Try again later/);
assert.match(changeMessage({ action: "pause", scope: "campaign", applied: 0, bulkLimited: true }), /Try again later.*bulk action.*2 times/);
assert.match(changeMessage({ action: "pause", scope: "campaign", applied: 0, duplicates: 2 }), /already in this state/);
assert.match(changeMessage({ action: "pause", scope: "campaign", applied: 2, duplicates: 1 }), /1 already in this state/);
assert.equal(CHANGE_LIMIT, 2);

// what an advertiser is told
const who = { campaignId: "c4", advertiserId: "a", creativeId: "x", category: "retail" };
assert.equal(controlNote(who, ctx), "");
assert.match(controlNote({ ...who, campaignId: "c1" }, ctx), /paused this campaign/);
assert.match(controlNote({ ...who, campaignId: "c2" }, ctx), /blocked this campaign.*Reason: bad/);
assert.match(controlNote({ ...who, advertiserId: "adv3" }, ctx), /blocked your account.*Reason: no/);
assert.match(controlNote({ ...who, creativeId: "cr9" }, ctx), /blocked this creative/);
assert.match(controlNote({ ...who, category: "gambling" }, ctx), /does not show ads of this category/);

console.log("game-controls tests passed");
