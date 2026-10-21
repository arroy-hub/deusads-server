// Targeting rules (lib/targeting.js). Run: node test/targeting.test.mjs
import assert from "node:assert/strict";
import {
  FIELDS,
  COUNTRIES,
  GENRES,
  GENRES_HINT,
  LANGUAGES,
  MAX_GAME_GENRES,
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
for (const [name, options] of [["genres", GENRES], ["platforms", PLATFORMS], ["languages", LANGUAGES], ["countries", COUNTRIES]]) {
  const ids = options.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, `${name}: ids are unique`);
  assert.ok(ids.every((id) => /^[a-z0-9]{2,12}$/.test(id)), `${name}: ids are short lowercase words`);
  assert.ok(options.every((option) => option.label.length > 0), `${name}: every id has a label`);
  assert.ok(ids.length <= FIELDS[name].max, `${name}: the list fits under the cap the database enforces`);
}
assert.equal(GENRES.length, 13);
assert.equal(PLATFORMS.length, 7);
assert.deepEqual(LANGUAGES.map((l) => l.label), [...LANGUAGES.map((l) => l.label)].sort((a, b) => a.localeCompare(b, "en")), "languages are alphabetical");
assert.equal(LANGUAGES[0].label, "Albanian");
assert.ok(LANGUAGES.some((language) => language.id === "ru") && LANGUAGES.some((language) => language.id === "en"));

// --- cleaning
assert.deepEqual(cleanList(["horror", "action", "nope", "action"], "genres"), ["action", "horror"], "official order, no repeats, no unknowns");
assert.deepEqual(cleanList("action", "genres"), [], "not a list");
assert.deepEqual(cleanList(undefined, "platforms"), []);
assert.deepEqual(cleanProfile({ genres: ["shooter"], platforms: ["quest", "x"], languages: ["en", "ru"], countries: ["us", "xx"] }), {
  genres: ["shooter"],
  platforms: ["quest"],
  languages: ["en", "ru"],
  countries: ["us"],
});
assert.deepEqual(cleanProfile(null), { genres: [], platforms: [], languages: [], countries: [] });
assert.equal(labelOf("genres", "rpg"), "RPG");
assert.equal(labelOf("exclude_genres", "rpg"), "RPG");
assert.equal(labelOf("genres", "gone"), "gone", "an id that left the list shows as itself");

// --- saving a game needs every list
assert.deepEqual(validateProfile({ genres: ["rpg"], platforms: ["ios"], languages: ["de"], countries: ["de"] }).value, { genres: ["rpg"], platforms: ["ios"], languages: ["de"], countries: ["de"] });
assert.equal(validateProfile({ genres: [], platforms: ["ios"], languages: ["de"], countries: ["de"] }).error, "Pick at least one genre.");
assert.equal(validateProfile({ genres: ["rpg"], platforms: ["fax"], languages: ["de"], countries: ["de"] }).error, "Pick at least one platform.", "unknown ids do not count");
assert.equal(validateProfile({ genres: ["rpg"], platforms: ["ios"], countries: ["de"] }).error, "Pick at least one language.");
assert.equal(validateProfile({ genres: ["rpg"], platforms: ["ios"], languages: ["de"] }).error, "Pick at least one country.");
assert.equal(validateProfile({ genres: ["rpg"], platforms: ["ios"], languages: ["de"], countries: ["zz"] }).error, "Pick at least one country.", "unknown countries do not count");

// --- a game claims at most four genres (a game that ticks them all would fit every campaign)
assert.equal(MAX_GAME_GENRES, 4);
assert.match(GENRES_HINT, /Up to 4/);
const fourGenres = ["action", "shooter", "puzzle", "horror"];
assert.deepEqual(validateProfile({ genres: fourGenres, platforms: ["ios"], languages: ["de"], countries: ["de"] }).value.genres, fourGenres, "four is allowed");
assert.equal(validateProfile({ genres: [...fourGenres, "racing"], platforms: ["ios"], languages: ["de"], countries: ["de"] }).error, "Pick up to 4 genres.", "five is too many");
assert.equal(validateProfile({ genres: GENRES.map((genre) => genre.id), platforms: ["ios"], languages: ["de"], countries: ["de"] }).error, "Pick up to 4 genres.", "every genre is too many");
assert.equal(validateProfile({ genres: [...fourGenres, "nope"], platforms: ["ios"], languages: ["de"], countries: ["de"] }).error, undefined, "an unknown id does not count towards the limit");
assert.equal(validateProfile({ genres: [], platforms: ["ios"], languages: ["de"], countries: ["de"] }).error, "Pick at least one genre.", "the empty list is still reported first");
// the limit is checked when a game is saved, not when it is read: a game saved earlier with more is left as it was
assert.deepEqual(cleanProfile({ genres: [...fourGenres, "racing", "sports"], platforms: ["ios"], languages: ["de"] }).genres.length, 6, "older games keep every genre");
assert.ok(fitsGame({ genres: [...fourGenres, "racing", "sports"], platforms: ["ios"], languages: ["de"] }, { genres: ["sports"] }), "and still match on all of them");
// the limit is for the game's own description only: an advertiser's audience may ask for any number
assert.deepEqual(parseTargeting({ genres: GENRES.map((genre) => genre.id) }).value.genres.length, GENRES.length, "an audience may ask for every genre");

// --- what a game row says about itself
assert.deepEqual(profileGaps({ genres: ["rpg"], platforms: [], languages: [], countries: [] }), { known: true, missing: ["platforms", "languages", "countries"] });
assert.deepEqual(profileGaps({ genres: ["rpg"], platforms: ["ios"], languages: ["en"], countries: ["de"] }), { known: true, missing: [] });
assert.deepEqual(profileGaps({ genres: ["rpg"], platforms: ["ios"], languages: ["en"] }), { known: true, missing: [] }, "a database without the countries column does not ask for them");
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

// --- countries: the game's audience, and the advertiser's wish for them
assert.ok(COUNTRIES.length > 190 && COUNTRIES.length <= FIELDS.countries.max);
assert.equal(labelOf("countries", "de"), "Germany");
assert.equal(labelOf("exclude_countries", "us"), "United States");
assert.deepEqual(COUNTRIES.map((c) => c.label), [...COUNTRIES.map((c) => c.label)].sort((a, b) => a.localeCompare(b, "en")), "countries are alphabetical");
assert.deepEqual(cleanList(["us", "de", "nope", "de"], "countries"), ["de", "us"].sort((a, b) => COUNTRIES.findIndex((c) => c.id === a) - COUNTRIES.findIndex((c) => c.id === b)), "official order, no repeats");
assert.deepEqual(cleanList(["us"], "exclude_countries"), ["us"], "the skip list uses the same countries");

assert.deepEqual(parseTargeting({ countries: ["de", "us"] }).value, { countries: cleanList(["de", "us"], "countries") });
assert.deepEqual(parseTargeting({ exclude_countries: ["ru"] }).value, { exclude_countries: ["ru"] });
assert.ok(parseTargeting({ countries: ["atlantis"] }).error, "unknown country");
assert.match(parseTargeting({ countries: ["ru"], exclude_countries: ["ru"] }).error, /Russia cannot be both wanted and excluded/);
assert.equal(hasTargeting({ countries: ["de"] }), true);
assert.equal(hasTargeting({ exclude_countries: ["de"] }), true);
assert.equal(
  targetingSummary({ genres: ["shooter"], countries: ["de", "us"], exclude_countries: ["ru"] }),
  "Genres: Shooter · Countries: Germany, United States · Not in countries: Russia"
);

const inGermany = { genres: ["shooter"], platforms: ["quest"], languages: ["de"], countries: ["de", "at"] };
assert.ok(fitsGame(inGermany, { countries: ["de"] }), "one shared country is enough");
assert.ok(fitsGame(inGermany, { countries: ["us", "at"] }), "any of the wanted countries");
assert.ok(!fitsGame(inGermany, { countries: ["us"] }), "no shared country");
assert.deepEqual(evaluate(inGermany, { countries: ["us"] }).problems, [{ field: "countries", kind: "mismatch" }]);
assert.ok(!fitsGame(inGermany, { exclude_countries: ["at"] }), "an excluded country rules the game out");
assert.deepEqual(evaluate(inGermany, { exclude_countries: ["at"] }).problems, [{ field: "countries", kind: "excluded" }]);
assert.ok(fitsGame(inGermany, { exclude_countries: ["us"] }));
assert.ok(!fitsGame(inGermany, { genres: ["shooter"], countries: ["us"] }), "between fields it is all of them");
assert.ok(fitsGame(inGermany, { genres: ["shooter"], countries: ["de"], exclude_countries: ["us"] }));
// strict: a game that has not filled in its countries gets no creative that asks about them, wanted or excluded
const noCountries = { genres: ["shooter"], platforms: ["quest"], languages: ["de"], countries: [] };
assert.deepEqual(evaluate(noCountries, { countries: ["de"] }).problems, [{ field: "countries", kind: "unfilled" }]);
assert.deepEqual(evaluate(noCountries, { exclude_countries: ["us"] }).problems, [{ field: "countries", kind: "unfilled" }]);
assert.ok(fitsGame(noCountries, { genres: ["shooter"] }), "and is untouched by audiences that do not mention countries");
assert.ok(!fitsGame({ genres: ["shooter"] }, { countries: ["de"] }), "an old row without the column counts as not filled in");
assert.equal(whyNot(evaluate(inGermany, { countries: ["us"] }).problems), "no matching country");
assert.equal(whyNot(evaluate(inGermany, { exclude_countries: ["de"] }).problems), "the game's country is excluded");
assert.equal(whyNot(evaluate(noCountries, { countries: ["de"] }).problems), "the game has not filled in its countries");
assert.equal(countFitting([inGermany, noCountries, { ...inGermany, countries: ["us"] }], { countries: ["de", "us"] }), 2);
assert.equal(eligibleRows([{ source: "booking", row: { creatives: { targeting: { countries: ["us"] } } } }, { source: "own", row: { creatives: { targeting: { countries: ["us"] } } } }], inGermany).length, 1, "the developer's own creative is never filtered");

console.log("targeting: all checks passed");
