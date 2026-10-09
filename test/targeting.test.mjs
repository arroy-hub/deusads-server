// Targeting rules (lib/targeting.js). Run: node test/targeting.test.mjs
import assert from "node:assert/strict";
import {
  FIELDS,
  GENRES,
  LANGUAGES,
  PLATFORMS,
  cleanList,
  cleanProfile,
  countFitting,
  eligibleRows,
  evaluate,
  fitsGame,
  gapWords,
  hasTargeting,
  labelOf,
  parseTargeting,
  profileGaps,
  targetingSummary,
  validateProfile,
  whyNot,
} from "../lib/targeting.js";

// --- the lists: unique ids, sensible shape
for (const [name, options] of [["genres", GENRES], ["platforms", PLATFORMS], ["languages", LANGUAGES]]) {
  const ids = options.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, `${name}: ids are unique`);
  assert.ok(ids.every((id) => /^[a-z0-9]{2,12}$/.test(id)), `${name}: ids are short lowercase words`);
  assert.ok(options.every((option) => option.label.length > 0), `${name}: every id has a label`);
  assert.ok(ids.length <= FIELDS[name].max, `${name}: the list fits under the cap the database enforces`);
}
assert.equal(GENRES.length, 13);
assert.equal(PLATFORMS.length, 7);
assert.ok(LANGUAGES.some((language) => language.id === "ru") && LANGUAGES.some((language) => language.id === "en"));

// --- cleaning
assert.deepEqual(cleanList(["horror", "action", "nope", "action"], "genres"), ["action", "horror"], "official order, no repeats, no unknowns");
assert.deepEqual(cleanList("action", "genres"), [], "not a list");
assert.deepEqual(cleanList(undefined, "platforms"), []);
assert.deepEqual(cleanProfile({ genres: ["shooter"], platforms: ["quest", "x"], languages: ["en", "ru"] }), {
  genres: ["shooter"],
  platforms: ["quest"],
  languages: ["en", "ru"],
});
assert.deepEqual(cleanProfile(null), { genres: [], platforms: [], languages: [] });
assert.equal(labelOf("genres", "rpg"), "RPG");
assert.equal(labelOf("exclude_genres", "rpg"), "RPG");
assert.equal(labelOf("genres", "gone"), "gone", "an id that left the list shows as itself");

// --- saving a game needs every list
assert.deepEqual(validateProfile({ genres: ["rpg"], platforms: ["ios"], languages: ["de"] }).value, { genres: ["rpg"], platforms: ["ios"], languages: ["de"] });
assert.equal(validateProfile({ genres: [], platforms: ["ios"], languages: ["de"] }).error, "Pick at least one genre.");
assert.equal(validateProfile({ genres: ["rpg"], platforms: ["fax"], languages: ["de"] }).error, "Pick at least one platform.", "unknown ids do not count");
assert.equal(validateProfile({ genres: ["rpg"], platforms: ["ios"] }).error, "Pick at least one language.");

// --- what a game row says about itself
assert.deepEqual(profileGaps({ genres: ["rpg"], platforms: [], languages: [] }), { known: true, missing: ["platforms", "languages"] });
assert.deepEqual(profileGaps({ genres: ["rpg"], platforms: ["ios"], languages: ["en"] }), { known: true, missing: [] });
assert.deepEqual(profileGaps({ id: "x", name: "old row without the columns" }), { known: false, missing: [] });
assert.deepEqual(profileGaps(null), { known: false, missing: [] });

assert.equal(gapWords([]), "");
assert.equal(gapWords(["languages"]), "languages");
assert.equal(gapWords(["genres", "languages"]), "genres and languages");
assert.equal(gapWords(["genres", "platforms", "languages"]), "genres, platforms and languages");

// --- parsing an audience
assert.deepEqual(parseTargeting(null), { value: null });
assert.deepEqual(parseTargeting({}), { value: null }, "an empty audience is every game");
assert.deepEqual(parseTargeting({ genres: [], platforms: [] }), { value: null });
assert.deepEqual(parseTargeting({ genres: ["horror", "shooter"], languages: ["ru"] }).value, { genres: ["shooter", "horror"], languages: ["ru"] });
assert.ok(parseTargeting({ genres: ["nope"] }).error, "unknown genre");
assert.ok(parseTargeting({ colour: ["red"] }).error, "unknown condition");
assert.ok(parseTargeting({ genres: "shooter" }).error, "not a list");
assert.ok(parseTargeting("shooter").error);
assert.ok(parseTargeting([]).error);
assert.match(parseTargeting({ genres: ["horror"], exclude_genres: ["horror"] }).error, /both wanted and excluded/);
assert.deepEqual(parseTargeting({ exclude_genres: ["horror"] }).value, { exclude_genres: ["horror"] });

assert.equal(hasTargeting(null), false);
assert.equal(hasTargeting({}), false);
assert.equal(hasTargeting({ genres: [] }), false);
assert.equal(hasTargeting({ languages: ["en"] }), true);
assert.equal(hasTargeting({ exclude_genres: ["horror"] }), true);
assert.equal(hasTargeting("x"), false);

assert.equal(targetingSummary(null), "");
assert.equal(
  targetingSummary({ genres: ["shooter", "horror"], platforms: ["quest"], exclude_genres: ["casual"] }),
  "Genres: Shooter, Horror · Platforms: Meta Quest (2, 3, Pro) · Not in genres: Casual"
);

// --- fitting
const game = { genres: ["shooter", "social"], platforms: ["quest"], languages: ["en", "ru"] };
const empty = { genres: [], platforms: [], languages: [] };

assert.equal(fitsGame(game, null), true, "no audience: every game");
assert.equal(fitsGame(empty, null), true, "no audience: even a game that said nothing");
assert.equal(fitsGame(null, null), true);
assert.equal(fitsGame(game, {}), true);

// inside a field: any of
assert.equal(fitsGame(game, { genres: ["horror", "shooter"] }), true);
assert.equal(fitsGame(game, { genres: ["horror", "puzzle"] }), false);
assert.deepEqual(evaluate(game, { genres: ["horror"] }).problems, [{ field: "genres", kind: "mismatch" }]);

// between fields: all
assert.equal(fitsGame(game, { genres: ["shooter"], platforms: ["quest"], languages: ["ru"] }), true);
assert.equal(fitsGame(game, { genres: ["shooter"], platforms: ["pico"] }), false);
assert.equal(fitsGame(game, { genres: ["shooter"], platforms: ["quest"], languages: ["de"] }), false);
assert.deepEqual(
  evaluate(game, { genres: ["puzzle"], platforms: ["pico"], languages: ["en"] }).problems,
  [{ field: "genres", kind: "mismatch" }, { field: "platforms", kind: "mismatch" }]
);

// exclusion
assert.equal(fitsGame(game, { exclude_genres: ["horror"] }), true);
assert.equal(fitsGame(game, { exclude_genres: ["horror", "social"] }), false);
assert.deepEqual(evaluate(game, { exclude_genres: ["social"] }).problems, [{ field: "genres", kind: "excluded" }]);
assert.equal(fitsGame(game, { genres: ["shooter"], exclude_genres: ["social"] }), false, "wanted and excluded at once: excluded wins");

// strict: a restricted field the game has not filled in does not fit; an unrestricted one does not matter
assert.equal(fitsGame(empty, { genres: ["shooter"] }), false);
assert.deepEqual(evaluate(empty, { genres: ["shooter"] }).problems, [{ field: "genres", kind: "unfilled" }]);
assert.equal(fitsGame(empty, { exclude_genres: ["horror"] }), false, "excluding a genre also restricts the field");
assert.equal(fitsGame(null, { languages: ["en"] }), false, "no profile at all is the same as empty");
assert.equal(fitsGame({ genres: ["shooter"], platforms: [], languages: [] }, { genres: ["shooter"] }), true, "other empty fields do not matter");
assert.equal(fitsGame({ genres: ["shooter"], platforms: [], languages: [] }, { genres: ["shooter"], platforms: ["quest"] }), false);
assert.deepEqual(
  evaluate({ genres: ["shooter"], platforms: [], languages: [] }, { genres: ["shooter"], platforms: ["quest"], languages: ["en"] }).problems,
  [{ field: "platforms", kind: "unfilled" }, { field: "languages", kind: "unfilled" }]
);
assert.equal(evaluate(empty, { genres: ["a"], exclude_genres: ["b"] }).problems.length, 1, "the same problem is reported once");

// a damaged audience fails closed
assert.equal(fitsGame(game, "shooter"), false);
assert.equal(fitsGame(game, ["shooter"]), false);
assert.equal(fitsGame(game, { genres: "shooter" }), false);
assert.deepEqual(evaluate(game, "x").problems, [{ field: "all", kind: "invalid" }]);
// ids that left the official list still match as plain ids
assert.equal(fitsGame({ genres: ["retired"], platforms: [], languages: [] }, { genres: ["retired"] }), true);

// counting and explaining
assert.equal(countFitting([game, empty, { genres: ["puzzle"], platforms: ["quest"], languages: ["en"] }], { platforms: ["quest"] }), 2);
assert.equal(countFitting([], { genres: ["shooter"] }), 0);
assert.equal(countFitting([game, empty], null), 2);
assert.equal(whyNot(evaluate(game, { genres: ["horror"] }).problems), "no matching genre");
assert.equal(whyNot(evaluate(empty, { genres: ["horror"], languages: ["en"] }).problems), "the game has not filled in its genres; the game has not filled in its languages");
assert.equal(whyNot(evaluate(game, { exclude_genres: ["social"] }).problems), "the game's genre is excluded");
assert.equal(whyNot(evaluate(game, "x").problems), "the audience settings are not valid");
assert.equal(whyNot([]), "");

// --- the manifest's rows: only booked creatives are filtered
const row = (source, targeting, id) => ({ source, creativeId: id, row: { creatives: { id, targeting } } });
const rows = [
  row("own", { genres: ["horror"] }, "own-with-audience"),
  row("own", undefined, "own-plain"),
  row("booking", undefined, "plain"),
  row("booking", null, "null"),
  row("booking", { genres: ["shooter"] }, "fits"),
  row("booking", { genres: ["horror"] }, "misses"),
  row("booking", { exclude_genres: ["shooter"] }, "excluded"),
  row("booking", { languages: ["ru"], platforms: ["quest"] }, "fits-two"),
];
assert.deepEqual(
  eligibleRows(rows, game).map((item) => item.creativeId),
  ["own-with-audience", "own-plain", "plain", "null", "fits", "fits-two"]
);
assert.deepEqual(
  eligibleRows(rows, empty).map((item) => item.creativeId),
  ["own-with-audience", "own-plain", "plain", "null"],
  "a game that filled in nothing gets no targeted creative"
);
assert.deepEqual(
  eligibleRows(rows, null).map((item) => item.creativeId),
  ["own-with-audience", "own-plain", "plain", "null"],
  "no profile at all behaves like an empty one"
);
assert.deepEqual(eligibleRows([], game), []);

console.log("targeting: all checks passed");
