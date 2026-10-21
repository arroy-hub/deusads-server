import assert from "node:assert/strict";
import { campaignMayServe, effectivePause } from "../lib/campaign-rules.js";

const game = { genres: ["sports"], platforms: ["quest"], languages: ["en"] };

assert.equal(campaignMayServe(null, "g1", game), true, "no rules: served");
assert.equal(campaignMayServe({ pausedAt: null, targeting: null, excluded: new Set() }, "g1", game), true);
assert.equal(campaignMayServe({ pausedAt: "2026-10-14T00:00:00Z", targeting: null, excluded: new Set() }, "g1", game), false, "paused");
assert.equal(campaignMayServe({ pausedAt: null, targeting: null, excluded: new Set(["g1"]) }, "g1", game), false, "game skipped");
assert.equal(campaignMayServe({ pausedAt: null, targeting: null, excluded: new Set(["g1"]) }, "g2", game), true, "another game is fine");
assert.equal(campaignMayServe({ pausedAt: null, targeting: { genres: ["sports"] }, excluded: new Set() }, "g1", game), true, "audience fits");
assert.equal(campaignMayServe({ pausedAt: null, targeting: { genres: ["racing"] }, excluded: new Set() }, "g1", game), false, "audience does not fit");
assert.equal(campaignMayServe({ pausedAt: null, targeting: { genres: ["sports"] }, excluded: new Set() }, "g1", null), false, "unreadable game fails closed");

assert.equal(effectivePause(null, null, "2026-10-14"), null, "not paused");
assert.equal(effectivePause("2026-10-10T08:00:00Z", null, "2026-10-14"), "2026-10-10T08:00:00Z", "paused until resumed");
assert.equal(effectivePause("2026-10-10T08:00:00Z", "", "2026-10-14"), "2026-10-10T08:00:00Z", "an empty resume day means no end");
assert.equal(effectivePause("2026-10-10T08:00:00Z", "2026-10-15", "2026-10-14"), "2026-10-10T08:00:00Z", "still paused before the resume day");
assert.equal(effectivePause("2026-10-10T08:00:00Z", "2026-10-14", "2026-10-14"), null, "served again on the resume day");
assert.equal(effectivePause("2026-10-10T08:00:00Z", "2026-10-12", "2026-10-14"), null, "and after it");


// country targeting (migration 0050): the campaign's countries are checked against the game's
const gameDe = { ...game, countries: ["de"] };
assert.equal(campaignMayServe({ pausedAt: null, targeting: { countries: ["de", "us"] }, excluded: new Set() }, "g1", gameDe), true, "game is in a wanted country");
assert.equal(campaignMayServe({ pausedAt: null, targeting: { countries: ["us"] }, excluded: new Set() }, "g1", gameDe), false, "game is in another country");
assert.equal(campaignMayServe({ pausedAt: null, targeting: { exclude_countries: ["de"] }, excluded: new Set() }, "g1", gameDe), false, "country skipped");
assert.equal(campaignMayServe({ pausedAt: null, targeting: { countries: ["de"] }, excluded: new Set() }, "g1", game), false, "game has not filled in its countries");
console.log("campaign-rules tests passed");
