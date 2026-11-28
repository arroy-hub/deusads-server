// The pictures a campaign shows in a game: one per creative and shape. Run: node test/game-pictures.test.mjs
import assert from "node:assert/strict";
import { ANY_SHAPE, isCropped, isShapeKey, landedPictures, landsOn, listWords, parsePictureId, pictureFor, pictureId, shapeAspect, shapeKey, shapeLabel } from "../lib/game-pictures.js";
import { controlMap, controlNote, mayServe, pictureControls, blockedCategories, changeMessage } from "../lib/game-controls.js";
import { campaignStatus, controlKind, controlLog, gameRows, gameStatus } from "../lib/advertiser-overview.js";

// ---- the key of a shape: a standard format, a custom shape to one decimal, or unknown
assert.equal(shapeKey(16 / 9), "r16x9");
assert.equal(shapeKey(1.7), "r16x9", "inside the tolerance of a format: that format");
assert.equal(shapeKey(1), "r1x1");
assert.equal(shapeKey(21 / 9), "x2.3", "a custom shape keeps its proportions, to one decimal");
assert.equal(shapeKey(2.32), shapeKey(2.34), "nearly the same custom shape is one row");
assert.equal(shapeKey(2.3), "r2x1", "inside the tolerance of 2:1");
assert.equal(shapeKey(null), ANY_SHAPE);
assert.equal(shapeKey("oops"), ANY_SHAPE);
assert.equal(shapeLabel("r16x9"), "16:9");
assert.equal(shapeLabel("x2.3"), "21:9");
assert.equal(shapeLabel("x4.0"), "4.00:1");
assert.equal(shapeLabel(ANY_SHAPE), "Unknown shape");
assert.equal(shapeAspect("r3x1"), 3);
assert.equal(shapeAspect("x2.3"), 2.3);
assert.equal(shapeAspect(ANY_SHAPE), null);
assert.ok(isShapeKey("r9x16") && isShapeKey("x0.4") && isShapeKey("any"));
assert.ok(!isShapeKey("16:9") && !isShapeKey("") && !isShapeKey("r16x9; drop"));

// ---- a picture's id is the creative and the shape
const id = pictureId("11111111-1111-4111-8111-111111111111", "r16x9");
assert.deepEqual(parsePictureId(id), { creativeId: "11111111-1111-4111-8111-111111111111", shape: "r16x9" });
assert.equal(parsePictureId("11111111-1111-4111-8111-111111111111"), null, "a plain id is not a picture");
assert.equal(parsePictureId("abc:nonsense"), null);

// ---- which picture a creative shows
const wide = { aspect: 681 / 240, safeZone: { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } }; // a banner: cannot be cut to 4:3
const assets = [
  { id: "a1", formatId: "r1x1", aspect: 1, status: "approved", storagePath: "p/1x1.png" },
  { id: "a2", formatId: "r16x9", aspect: 16 / 9, status: "approved", storagePath: "p/16x9.png" },
  { id: "a3", formatId: "r4x3", aspect: 4 / 3, status: "pending", storagePath: "p/4x3.png" },
];
assert.equal(pictureFor({ creative: wide, assets, aspect: 1 }).asset.id, "a1");
assert.equal(pictureFor({ creative: wide, assets, aspect: 21 / 9 }).kind, "crop", "a custom shape takes the main picture, cut");
assert.equal(pictureFor({ creative: wide, assets, aspect: 4 / 3 }).kind, "none", "a picture still in review does not count, and the banner cannot be cut to 4:3");
assert.ok(!landsOn({ creative: wide, assets, aspect: 4 / 3 }));
assert.equal(pictureFor({ creative: { aspect: null }, assets: [], aspect: 4 / 3 }).kind, "crop", "a creative never measured shows its main picture as it is");
assert.ok(isCropped(681 / 240, 21 / 9));
assert.ok(!isCropped(16 / 9, 1.75), "a sliver is not worth a mark");

// ---- the rows of a campaign in a game (the case from the pilot: game 2313, campaign DeusPAY_1)
const placementOf = new Map([
  ["ball1", { name: "Ball_1", aspect: 1 }],
  ["ball2", { name: "Ball_2", aspect: 1 }],
  ["corner1", { name: "Corner_1", aspect: 16 / 9 }],
  ["corner2", { name: "Corner_2", aspect: 16 / 9 }],
  ["wide", { name: "DeusAd Placement 21x9", aspect: 21 / 9 }],
  ["topleft", { name: "Top_Left", aspect: 21 / 9 }],
  ["four", { name: "DeusAd Placement 4x3", aspect: 4 / 3 }],
]);
const creativeOf = new Map([["sq", wide], ["logo", { aspect: 1, safeZone: { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } }]]);
const assetsOf = new Map([["sq", assets]]);
const active = (creativeId) => [...placementOf.keys()].map((placementId) => ({ creativeId, placementId, base: "active" }));
const rows = landedPictures({ bookings: active("sq"), placementOf, creativeOf, assetsOf });
assert.deepEqual(rows.map((row) => `${row.shape}:${row.kind}:${row.placements.map((spot) => spot.name).join("+")}`), [
  "x2.3:crop:DeusAd Placement 21x9+Top_Left",
  "r16x9:asset:Corner_1+Corner_2",
  "r1x1:asset:Ball_1+Ball_2",
], "one row per picture, widest first; the 4:3 placement gets nothing and is not listed");
assert.ok(rows.every((row) => row.base === "active"));

// a second creative that only has a square picture: only the square placements
const both = landedPictures({ bookings: [...active("sq"), ...active("logo")], placementOf, creativeOf, assetsOf });
assert.deepEqual(both.filter((row) => row.creativeId === "logo").map((row) => row.shape), ["r4x3", "r1x1"], "a square can be cut to 4:3 inside its safe zone, not to a banner");
assert.equal(both[0].creativeId, "sq", "creatives stay in the order they were booked");

// a campaign none of whose pictures fits any placement of the game is not in the game
assert.deepEqual(landedPictures({ bookings: [{ creativeId: "sq", placementId: "four", base: "active" }], placementOf, creativeOf, assetsOf }), []);
// ended bookings: the row stays, as ended, and says where it was
const over = landedPictures({ bookings: [{ creativeId: "sq", placementId: "ball1", base: "ended" }, { creativeId: "sq", placementId: "ball2", base: "active" }], placementOf, creativeOf, assetsOf });
assert.equal(over[0].base, "active");
assert.deepEqual(over[0].placements.map((spot) => spot.name), ["Ball_2"], "only where it shows now");
const gone = landedPictures({ bookings: [{ creativeId: "sq", placementId: "ball1", base: "ended" }], placementOf, creativeOf, assetsOf });
assert.equal(gone[0].base, "ended");
assert.deepEqual(gone[0].placements.map((spot) => spot.name), ["Ball_1"], "all over: where it was");
// a placement that is no longer known gives nothing
assert.deepEqual(landedPictures({ bookings: [{ creativeId: "sq", placementId: "nope", base: "active" }], placementOf, creativeOf, assetsOf }), []);

assert.equal(listWords(["A"]), "A");
assert.equal(listWords(["A", "B"]), "A and B");
assert.equal(listWords(["A", "B", "C"]), "A, B and C");

// ---- a creative blocked in one shape: only that shape stops, in the game and for the advertiser
const blocks = pictureControls([{ game_id: "g1", creative_id: "sq", shape: "r16x9", reason: "Low picture quality", changed_at: "2026-11-23T10:00:00Z" }]);
assert.deepEqual(blocks[0], { game_id: "g1", scope: "picture", target_id: "sq:r16x9", state: "blocked", reason: "Low picture quality", comment: null, changed_at: "2026-11-23T10:00:00Z" });
const ctx = { controls: controlMap(blocks), blocked: blockedCategories([]) };
const booked = { source: "booking", campaignId: "c1", advertiserId: "adv", creativeId: "sq", category: "retail" };
assert.equal(mayServe({ ...booked, shape: "r16x9" }, ctx), false, "the blocked shape is not served");
assert.equal(mayServe({ ...booked, shape: "r1x1" }, ctx), true, "its other shapes are");
assert.equal(mayServe(booked, ctx), true, "no shape given: as before");
assert.equal(mayServe({ ...booked, source: "own", shape: "r16x9" }, ctx), true, "the developer's own pictures always show");
assert.match(controlNote({ ...booked, shape: "r16x9" }, ctx), /blocked this creative in 16:9 in this game.*Reason: Low picture quality\./);
assert.equal(controlNote({ ...booked, shape: "r1x1" }, ctx), "");
assert.equal(controlKind(controlNote({ ...booked, shape: "r16x9" }, ctx)), "blocked");
assert.match(changeMessage({ action: "block", scope: "picture", applied: 1, names: ["Square · 16:9"] }), /Blocked creative "Square · 16:9" in this game\./);
const log = controlLog({ controlRows: blocks, campaignId: "c1", advertiserId: "adv", creativeIds: ["sq"], names: { games: new Map([["g1", "2313"]]), creatives: new Map([["sq", "Square"]]) } });
assert.deepEqual(log.map((entry) => [entry.game, entry.title, entry.what, entry.reason]), [["2313", "Creative blocked in one shape", "Square · 16:9", "Low picture quality"]]);
assert.deepEqual(controlLog({ controlRows: blocks, campaignId: "c1", advertiserId: "adv", creativeIds: ["other"], names: {} }), [], "another creative's block is not this campaign's");

// ---- for the advertiser a booking with no picture to show is not a place the campaign runs
const live = (extra = {}) => ({ status: "approved", label: "Live", gameId: "g1", game: "2313", ...extra });
const NOTE = "Not shown here: this creative has no picture for the shape of this placement. It starts by itself when it has one.";
assert.equal(controlKind(NOTE), "picture");
const none = live({ noPicture: true, controlNote: NOTE });
assert.equal(campaignStatus([live(), live(), none]).note, "2 placements", "only the placements that show something are counted");
assert.equal(campaignStatus([live(), none]).key, "live", "a booking with no picture does not make the campaign limited");
assert.deepEqual([campaignStatus([none], { launched: true }).key, campaignStatus([none]).label], ["waiting", "Waiting"], "nothing fits anywhere: it waits");
assert.match(campaignStatus([none]).note, /It starts by itself when one does/);
assert.equal(campaignStatus([none], { paused: true }).key, "paused", "the advertiser's own pause still reads first");
// games: one with nothing to show and no history is not listed; one that showed before stays, saying why it stopped
const other = live({ gameId: "g2", game: "Castle" });
assert.deepEqual(gameRows([none, other], []).map((row) => row.game), ["Castle"]);
const past = gameRows([none, other], [{ gameId: "g1", game: "2313", impressions: 40, avgVisible: 3 }]);
assert.deepEqual(past.map((row) => [row.game, row.label]), [["2313", "No picture fits"], ["Castle", "Showing"]]);
assert.equal(gameStatus([none, live()]).state, "showing", "something of it still shows in that game");

// ---- a report about one picture: the admin reads which picture, where it stands and what it has shown
{
  const { disputeRows, disputeEvents } = await import("../lib/admin-disputes.js");
  const [row] = disputeRows([{ id: "d1", initiator: "developer", status: "open", created_at: "2026-11-28T10:40:00Z", game_id: "g1", creative_id: "sq", campaign_id: "c1", shape: "r16x9", shapeLabel: "16:9", creativeName: "Square", creativeUrl: "https://files/assets/sq-16x9.png", byName: "Dev", againstName: "Adv", gameName: "2313", reason: "Inappropriate content" }]);
  assert.deepEqual([row.picture, row.shape, row.campaignId, row.creativeUrl], ["Square · 16:9", "r16x9", "c1", "https://files/assets/sq-16x9.png"]);
  const facts = Object.fromEntries(disputeEvents(row, [], { booking: { id: "b1", placement: "Corner_1, Corner_2", campaign: "DeusPAY_1", from: "2026-11-23", to: "", impressions: 22, earned: 0.1056 }, creative: { size: "681 × 240" } })[0].facts.map(([label, value]) => [label, value]));
  assert.equal(facts.Placements, "Corner_1, Corner_2");
  assert.match(facts.Booking, /^DeusPAY_1 · /);
  assert.equal(facts["Impressions so far"], "22 impressions · 0.11 C. earned by the developer");
  assert.match(facts.Creative, /^Square · 16:9 · 681 × 240/);
  // a report about a whole creative, with nothing found in the game, reads as before
  const [plain] = disputeRows([{ id: "d2", status: "open", created_at: "2026-11-28T10:40:00Z", creativeName: "Square", reason: "Other" }]);
  assert.equal(plain.picture, "Square");
  assert.equal(Object.fromEntries(disputeEvents(plain, [], {})[0].facts.map(([label, value]) => [label, value])).Placement, "—");
}

console.log("game-pictures tests passed");
