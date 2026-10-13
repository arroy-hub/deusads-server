// Advertiser Overview and campaign report rules. Run: node test/advertiser-overview.test.mjs
import assert from "node:assert/strict";
import {
  attentionItems,
  campaignStatus,
  controlKind,
  controlLog,
  coverageSummary,
  creativeShape,
  deltaText,
  formatShare,
  gameRows,
  gameStatus,
} from "../lib/advertiser-overview.js";

// change against the previous period
assert.deepEqual(deltaText(112, 100), { text: "+12%", tone: "up" });
assert.deepEqual(deltaText(106.2, 100), { text: "+6.2%", tone: "up" });
assert.deepEqual(deltaText(94, 100), { text: "−6%", tone: "down" });
assert.deepEqual(deltaText(100, 100), { text: "no change", tone: "flat" });
assert.equal(deltaText(5, 0), null, "nothing to compare with");
assert.equal(deltaText("x", 10), null);

// a creative's shape from database columns
assert.deepEqual(creativeShape({ width_px: 1600, height_px: 900 }), { aspect: 16 / 9, safeZone: undefined });
assert.equal(creativeShape({}).aspect, null);
assert.deepEqual(creativeShape({ width_px: 100, height_px: 100, safe_x: 0.1, safe_y: 0.2, safe_w: 0.5, safe_h: 0.6 }).safeZone, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 });

// coverage: a wide picture with the default 70% safe zone covers wide shapes by cropping, not tall or banner ones
const wide = { aspect: 16 / 9, safeZone: { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } };
const none = coverageSummary({ creative: wide, assets: [], placements: [{ aspect: 16 / 9 }, { aspect: 9 / 16 }, { aspect: 9 / 16 }, { aspect: 3 }, { aspect: null }] });
assert.ok(none.missingFormats.includes("r9x16") && none.missingFormats.includes("r3x1"));
assert.ok(!none.missingFormats.includes("r16x9"));
assert.equal(none.placements, 4, "a placement of unknown shape is not counted");
assert.equal(none.missingPlacements, 3);
assert.deepEqual(none.missingLabels.slice(-2), ["9:16", "3:1"]);
// an approved picture for a format closes the gap; a pending one does not
const withTall = coverageSummary({ creative: wide, assets: [{ formatId: "r9x16", aspect: 9 / 16, status: "approved" }], placements: [{ aspect: 9 / 16 }] });
assert.equal(withTall.missingPlacements, 0);
assert.ok(!withTall.missingFormats.includes("r9x16"));
const pending = coverageSummary({ creative: wide, assets: [{ formatId: "r9x16", aspect: 9 / 16, status: "pending" }], placements: [{ aspect: 9 / 16 }] });
assert.equal(pending.missingPlacements, 1);
// a picture of unknown size can always be cropped (as the manifest does)
assert.equal(coverageSummary({ creative: { aspect: null }, assets: [], placements: [{ aspect: 9 / 16 }] }).missingPlacements, 0);

// a control note says what the developer did
assert.equal(controlKind(""), "");
assert.equal(controlKind("The developer paused this campaign in this game. It shows again when they resume it."), "paused");
assert.equal(controlKind("The developer blocked this campaign in this game. Reason: Too many ads."), "blocked");
assert.equal(controlKind("The developer blocked your account in this game, so none of your ads show here."), "blocked");
assert.equal(controlKind("This game does not show ads of this category."), "category");

// campaign status from bookings
const booking = (over) => ({ status: "approved", label: "Live", controlNote: "", ...over });
assert.equal(campaignStatus([]).key, "draft");
assert.equal(campaignStatus([booking({})]).key, "live");
assert.equal(campaignStatus([booking({ label: "Live until 1 Nov" })]).key, "live");
const limited = campaignStatus([booking({}), booking({ controlNote: "The developer paused this campaign in this game." })]);
assert.equal(limited.key, "limited");
assert.match(limited.note, /1 of 2/);
assert.equal(campaignStatus([booking({ controlNote: "The developer paused this campaign in this game." })]).key, "stopped");
assert.equal(campaignStatus([booking({ status: "pending", label: "Waiting for the creative to be approved" })]).key, "waiting");
assert.equal(campaignStatus([booking({ label: "Scheduled from 1 Nov" })]).key, "scheduled");
assert.equal(campaignStatus([booking({ label: "Ended" }), booking({ status: "ended", label: "Ended" })]).key, "ended");
assert.equal(campaignStatus([booking({ label: "Live" }), booking({ label: "Ended", status: "ended" })]).key, "live", "ended bookings do not count against a live campaign");

// a game's state: showing wins if any live booking is free
assert.equal(gameStatus([booking({}), booking({ controlNote: "The developer paused this campaign in this game." })]).state, "showing");
assert.deepEqual(
  gameStatus([booking({ controlNote: "The developer paused this campaign in this game. It shows again when they resume it." })]),
  { state: "paused", label: "Paused by developer", note: "The developer paused this campaign in this game. It shows again when they resume it." }
);
assert.equal(gameStatus([booking({ controlNote: "This game does not show ads of this category." })]).label, "Category not shown");
assert.equal(gameStatus([booking({ label: "Ended", status: "ended" })]).state, "ended");

// per game table: sums, weighted average, share, busiest first
const rows = [
  { gameId: "g1", game: "A", impressions: 30, avgVisible: 2 },
  { gameId: "g1", game: "A", impressions: 10, avgVisible: 6 },
  { gameId: "g2", game: "B", impressions: 60, avgVisible: null },
  { gameId: "gone", game: "Z", impressions: 99, avgVisible: 1 },
];
const byGame = gameRows(
  [booking({ gameId: "g1", game: "A" }), booking({ gameId: "g2", game: "B", controlNote: "The developer paused this campaign in this game." })],
  rows
);
assert.deepEqual(byGame.map((row) => row.game), ["B", "A"]);
assert.equal(byGame[1].impressions, 40);
assert.equal(byGame[1].avgVisible, 3, "(30*2 + 10*6) / 40");
assert.equal(byGame[0].avgVisible, null);
assert.equal(byGame[0].share, 0.6);
assert.equal(byGame[0].state, "paused");

// the log of pauses and blocks keeps only what touches the campaign
const controlRows = [
  { game_id: "g1", scope: "campaign", target_id: "camp", state: "paused", reason: "", changed_at: "2026-10-08T10:00:00Z" },
  { game_id: "g2", scope: "creative", target_id: "cr1", state: "blocked", reason: "Off topic", changed_at: "2026-10-05T10:00:00Z" },
  { game_id: "g2", scope: "creative", target_id: "other-creative", state: "blocked", reason: "x", changed_at: "2026-10-06T10:00:00Z" },
  { game_id: "g3", scope: "campaign", target_id: "other-campaign", state: "paused", reason: "", changed_at: "2026-10-07T10:00:00Z" },
  { game_id: "g3", scope: "advertiser", target_id: "me", state: "blocked", reason: "", changed_at: "2026-10-09T10:00:00Z" },
];
const log = controlLog({
  controlRows,
  campaignId: "camp",
  advertiserId: "me",
  creativeIds: ["cr1"],
  names: { games: new Map([["g1", "Orbit"], ["g2", "Dusk"], ["g3", "Pitch"]]), creatives: new Map([["cr1", "Hero 1:1"]]) },
});
assert.deepEqual(log.map((row) => `${row.game}|${row.title}|${row.at}`), [
  "Pitch|Account blocked|2026-10-09",
  "Orbit|Campaign paused|2026-10-08",
  "Dusk|Creative blocked|2026-10-05",
]);
assert.equal(log[2].what, "Hero 1:1");
assert.equal(log[2].reason, "Off topic");

// delivery by format
const aspects = new Map([["p1", 16 / 9], ["p2", 16 / 9], ["p3", 9 / 16], ["p4", 5]]);
const share = formatShare([{ placement_id: "p1", impressions: "30" }, { placement_id: "p2", impressions: 10 }, { placement_id: "p3", impressions: 50 }, { placement_id: "p4", impressions: 10 }], aspects);
assert.equal(share.find((row) => row.id === "r16x9").impressions, 40);
assert.equal(share.find((row) => row.id === "r9x16").share, 0.5);
assert.equal(share.find((row) => row.id === "r3x1").impressions, 0);
assert.equal(share.at(-1).id, "other");
assert.equal(formatShare([], new Map()).every((row) => row.share === 0), true);

// attention: most urgent first, gaps without missing placements are silent
const items = attentionItems({
  rejected: [{ id: "c1", name: "Hero", note: "Blurry" }],
  gaps: [{ id: "c2", name: "Banner", missingLabels: ["9:16", "3:1"], missingPlacements: 15 }, { id: "c3", name: "Fine", missingLabels: [], missingPlacements: 0 }],
  limited: [{ id: "k1", name: "Spring", key: "limited", note: "1 of 2 live placements switched off by developers" }],
  disputes: [
    { creativeId: "c1", name: "Hero", status: "open", reason: "Misleading" },
    { creativeId: "c4", name: "Old", status: "resolved", outcome: "dismissed", reason: "x" },
  ],
});
assert.deepEqual(items.map((item) => item.key), ["rejected:c1", "limited:k1", "gap:c2", "dispute:c1"]);
assert.equal(items.find((item) => item.key === "gap:c2").title, "Banner is not shown in 15 placements");
assert.equal(attentionItems({}).length, 0);

console.log("advertiser-overview tests passed");
