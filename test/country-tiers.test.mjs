// Country tiers (lib/country-tiers.js). Run: node test/country-tiers.test.mjs
import assert from "node:assert/strict";
import { COUNTRIES } from "../lib/targeting.js";
import {
  LISTED_TIERS,
  TIERS,
  countriesByTier,
  countryMode,
  gamesByTier,
  pickState,
  reachedCountries,
  tierCounts,
  tierOf,
  tierSummary,
  toggleList,
} from "../lib/country-tiers.js";

// --- the lists: real country ids, each in one tier only
const known = new Set(COUNTRIES.map((c) => c.id));
const seen = new Set();
for (const [tier, ids] of Object.entries(LISTED_TIERS)) {
  for (const id of ids) {
    assert.ok(known.has(id), `tier ${tier}: ${id} is a country id`);
    assert.ok(!seen.has(id), `${id} is in one tier only`);
    seen.add(id);
  }
}
assert.equal(LISTED_TIERS[1].length, 20);
assert.deepEqual(TIERS.map((t) => t.id), [1, 2, 3]);

// --- tierOf
assert.equal(tierOf("us"), 1);
assert.equal(tierOf("DE"), 1);
assert.equal(tierOf("pl"), 2);
assert.equal(tierOf("in"), 3);
assert.equal(tierOf("zz"), 3, "a country that is not listed is Tier 3");
assert.equal(tierOf("ad"), 3, "a real country that is not listed is Tier 3");

// --- every country lands in exactly one column
const groups = countriesByTier();
assert.equal(groups.length, 3);
const all = groups.flatMap((g) => g.countries.map((c) => c.id));
assert.equal(all.length, COUNTRIES.length);
assert.equal(new Set(all).size, COUNTRIES.length);
assert.ok(groups[0].countries.every((c) => tierOf(c.id) === 1));
assert.deepEqual(groups[0].countries.map((c) => c.label), [...groups[0].countries.map((c) => c.label)].sort((a, b) => a.localeCompare(b, "en")), "alphabetical");

// --- counts and summaries
assert.deepEqual(tierCounts(["us", "de", "pl", "in", "ad", "us"]), { 1: 2, 2: 1, 3: 2 });
assert.deepEqual(tierCounts([]), { 1: 0, 2: 0, 3: 0 });
assert.deepEqual(tierCounts(undefined), { 1: 0, 2: 0, 3: 0 });
assert.equal(tierSummary(["us", "de", "in"]), "Tier 1 · 2, Tier 3 · 1");
assert.equal(tierSummary([]), "");

// --- ticking a tier
const t1 = groups[0].countries.map((c) => c.id);
assert.equal(pickState(t1, []), "none");
assert.equal(pickState(t1, ["us"]), "some");
assert.equal(pickState(t1, t1), "all");
assert.deepEqual([...toggleList(t1, ["in"])].sort(), [...t1, "in"].sort(), "a partly ticked tier is completed, others stay");
assert.deepEqual(toggleList(t1, [...t1, "in"]), ["in"], "a fully ticked tier is cleared, others stay");
assert.deepEqual(toggleList(t1, ["us"]).length, t1.length);

// --- a campaign's mode and reach
assert.equal(countryMode({}), "all");
assert.equal(countryMode({ countries: ["us"] }), "only");
assert.equal(countryMode({ exclude_countries: ["in"] }), "except");
assert.equal(countryMode({ countries: ["us"], exclude_countries: ["in"] }), "only");
assert.equal(reachedCountries({}).length, COUNTRIES.length);
assert.deepEqual(reachedCountries({ countries: ["us", "de"] }), ["us", "de"]);
assert.deepEqual(reachedCountries({ countries: ["us", "de"], exclude_countries: ["de"] }), ["us"]);
assert.equal(reachedCountries({ exclude_countries: ["in", "us"] }).length, COUNTRIES.length - 2);

// --- games per tier
const profiles = [{ countries: ["us", "in"] }, { countries: ["pl"] }, { countries: [] }, null];
assert.deepEqual(gamesByTier(profiles, ["us", "pl", "in"]).map((r) => r.games), [1, 1, 1]);
assert.deepEqual(gamesByTier(profiles, ["us"]).map((r) => r.games), [1, 0, 0]);
assert.deepEqual(gamesByTier(profiles, []).map((r) => r.games), [0, 0, 0]);

console.log("country-tiers: ok");
