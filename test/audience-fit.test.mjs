import assert from "node:assert/strict";
import { audienceNote, audienceProblem, audienceWords, fitOf, loadFitInputs } from "../lib/audience-fit.js";
import { campaignState, controlMap, controlNote } from "../lib/game-controls.js";
import { campaignStatus, controlKind, deliveryNote, gameStatus } from "../lib/advertiser-overview.js";

const racing = { genres: ["racing"], platforms: ["quest"], languages: ["en"], countries: ["de", "nl"] };
const puzzle = { ...racing, genres: ["puzzle"] };
const abroad = { ...racing, countries: ["us"] };

// the same questions the manifest asks: the campaign's audience first, then the creative's
assert.equal(audienceProblem({ campaignTargeting: { genres: ["racing"] }, profile: racing }), null);
assert.equal(audienceProblem({ campaignTargeting: null, creativeTargeting: null, profile: puzzle }), null, "no audience: every game fits");
assert.deepEqual(audienceProblem({ campaignTargeting: { genres: ["racing"] }, profile: puzzle }), { scope: "campaign", why: "no matching genre" });
assert.deepEqual(audienceProblem({ campaignTargeting: { countries: ["de"] }, profile: abroad }), { scope: "campaign", why: "no matching country" });
assert.equal(audienceProblem({ campaignTargeting: { genres: ["racing"] }, creativeTargeting: { countries: ["us"] }, profile: racing })?.scope, "creative");
assert.equal(audienceProblem({ campaignTargeting: { genres: ["racing"] }, profile: null }), null, "a profile that could not be read: nothing is claimed");
assert.equal(audienceProblem({ campaignTargeting: { genres: ["racing"] }, profile: { ...racing, genres: [] } })?.why, "the game has not filled in its genres");

assert.equal(audienceWords({ scope: "campaign", why: "no matching genre" }), "this game does not fit the campaign's audience (no matching genre)");
assert.match(audienceNote({ scope: "creative", why: "no matching country" }), /^This game does not fit the creative's audience \(no matching country\), so the ad is not shown here\./);
assert.equal(audienceNote(null), "");

// inputs for a whole page of bookings, read once
const fake = (tables, failing = null) => ({
  from: (table) => ({ select: () => ({ in: async (_column, ids) => (table === failing ? { data: null, error: { code: "42703" } } : { data: tables[table].filter((row) => ids.includes(row.id)), error: null }) }) }),
});
const tables = {
  campaigns: [{ id: "c1", targeting: { genres: ["racing"] } }, { id: "c2", targeting: null }],
  creatives: [{ id: "k1", targeting: null }],
  games: [{ id: "g1", ...puzzle }, { id: "g2", ...racing }],
};
const inputs = await loadFitInputs(fake(tables), { campaignIds: ["c1", "c2", "c1"], creativeIds: ["k1"], gameIds: ["g1", "g2"] });
assert.equal(fitOf(inputs, { campaignId: "c1", creativeId: "k1", gameId: "g1" })?.scope, "campaign", "the game became a puzzle game");
assert.equal(fitOf(inputs, { campaignId: "c1", creativeId: "k1", gameId: "g2" }), null);
assert.equal(fitOf(inputs, { campaignId: "c2", creativeId: "k1", gameId: "g1" }), null, "a campaign without an audience still fits");
assert.equal(await loadFitInputs(fake(tables, "games"), { campaignIds: ["c1"], creativeIds: [], gameIds: ["g1"] }), null, "a missing column: claim nothing");
assert.equal(fitOf(null, { campaignId: "c1", creativeId: "k1", gameId: "g1" }), null);

// the developer's Campaigns tab: the state a campaign has in the game
const ctx = { controls: controlMap([]), blocked: new Set() };
const problem = { scope: "campaign", why: "no matching genre" };
const base = { campaignId: "c1", advertiserId: "a1", category: "games_apps", base: "active" };
assert.equal(campaignState({ ...base, fit: problem }, ctx).key, "nofit");
assert.equal(campaignState({ ...base, fit: problem }, ctx).reason, "no matching genre");
assert.equal(campaignState({ ...base, fit: null }, ctx).key, "active");
assert.equal(campaignState({ ...base, base: "ended", fit: problem }, ctx).key, "ended", "what is over stays over");
assert.equal(campaignState({ ...base, advertiserPaused: true, fit: problem }, ctx).key, "advpaused", "a pause says more than the audience");
const paused = { controls: controlMap([{ scope: "campaign", target_id: "c1", state: "paused" }]), blocked: new Set() };
assert.equal(campaignState({ ...base, fit: problem }, paused).key, "paused", "the developer's own pause comes first");

// what the advertiser is told
const note = audienceNote(problem);
assert.equal(controlNote({ campaignId: "c1", advertiserId: "a1", creativeId: "k1", category: "x", audience: note }, ctx), note);
const heldByDev = { controls: controlMap([{ scope: "campaign", target_id: "c1", state: "paused" }]), blocked: new Set() };
assert.match(controlNote({ campaignId: "c1", advertiserId: "a1", creativeId: "k1", audience: note }, heldByDev), /paused this campaign/, "a pause is named before the audience");
assert.equal(controlNote({ campaignId: "c1", advertiserId: "a1", creativeId: "k1" }, ctx), "");
assert.equal(controlKind(note), "audience");

const live = (extra = {}) => ({ status: "approved", label: "Live now", gameId: "g1", game: "Alpha", controlNote: "", ...extra });
assert.deepEqual(gameStatus([live({ controlNote: note })]), { state: "audience", label: "Game does not fit", note });
assert.equal(gameStatus([live(), live({ controlNote: note })]).state, "showing");
const all = campaignStatus([live({ controlNote: note }), live({ controlNote: note })]);
assert.deepEqual([all.key, all.label], ["stopped", "Not showing"]);
assert.match(all.note, /does not fit the audience/);
const some = campaignStatus([live(), live({ controlNote: note })]);
assert.deepEqual([some.key, some.note], ["limited", "1 of 2 live placements are not showing (developers or audience)"]);
assert.equal(campaignStatus([live(), live({ controlNote: "The developer paused this campaign in this game." })]).note, "1 of 2 live placements switched off by developers", "without the audience the old wording stays");
const text = deliveryNote([{ state: "audience" }, { state: "audience" }, { state: "showing" }], { key: "limited" }).text;
assert.match(text, /2 games do not fit the audience now/);
assert.match(text, /still run in 1 other game/);

console.log("audience-fit tests passed");
