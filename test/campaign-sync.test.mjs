import assert from "node:assert/strict";
import { placementsToBook } from "../lib/campaign-sync.js";
import { campaignStatus } from "../lib/advertiser-overview.js";

const P = (id, game, genres, platforms = ["quest"], languages = ["en"], owner = "dev") => ({ id, owner_id: owner, game_id: game, games: { genres, platforms, languages } });
const open = [P("p1", "g1", ["racing"]), P("p2", "g1", ["racing"]), P("p3", "g2", ["horror"]), P("p4", "g3", ["racing"], ["steamvr"]), P("p5", "g4", ["racing"], ["quest"], ["en"], "me")];
const ids = (list) => list.map((p) => p.id);

// everything that fits, nothing else
assert.deepEqual(ids(placementsToBook({ open, targeting: { genres: ["racing"], platforms: ["quest"] }, advertiserId: "me" })), ["p1", "p2"]);
// no audience: every game except the advertiser's own
assert.deepEqual(ids(placementsToBook({ open, targeting: null, advertiserId: "me" })), ["p1", "p2", "p3", "p4"]);
// excluded games and bookings that exist are left alone
assert.deepEqual(ids(placementsToBook({ open, targeting: null, excludedGames: new Set(["g2"]), alreadyBooked: new Set(["p1"]), advertiserId: "me" })), ["p2", "p4"]);
// the creative's own audience applies too
assert.deepEqual(ids(placementsToBook({ open, targeting: null, creativeTargeting: { genres: ["horror"] }, advertiserId: "me" })), ["p3"]);
// nothing fits: nothing to book, and the campaign waits
assert.deepEqual(placementsToBook({ open, targeting: { genres: ["puzzle"] }, advertiserId: "me" }), []);
assert.equal(campaignStatus([], { launched: true }).key, "waiting");
assert.equal(campaignStatus([], {}).key, "draft");

// country targeting (migration 0050)
const C = (id, game, countries) => ({ id, owner_id: "dev", game_id: game, games: { genres: ["racing"], platforms: ["quest"], languages: ["en"], countries } });
const abroad = [C("c1", "g1", ["de"]), C("c2", "g2", ["us"]), C("c3", "g3", [])];
assert.deepEqual(ids(placementsToBook({ open: abroad, targeting: { countries: ["de"] }, advertiserId: "me" })), ["c1"]);
assert.deepEqual(ids(placementsToBook({ open: abroad, targeting: { exclude_countries: ["de"] }, advertiserId: "me" })), ["c2"], "a game without countries is skipped (strict)");
console.log("campaign-sync tests passed");
