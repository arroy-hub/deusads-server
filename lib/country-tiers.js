// Country tiers: how DeusADS groups countries by the value of their players to advertisers.
// Pure and shared by the game form, the campaign wizard and the tests. The tiers live in code, not in the
// database: nothing is stored but the chosen country ids, so the list can change without a migration.
//
// There is no official list. This one follows common practice in mobile and game advertising and is judged on
// four things: income and ad budgets, player spending, language reach and the price of reaching players.
// A country that is not listed here counts as Tier 3.

import { COUNTRIES } from "./targeting.js";

export const TIERS = [
  { id: 1, label: "Tier 1", desc: "Highest ad value. Wealthy markets with the biggest ad budgets and the strongest player spending." },
  { id: 2, label: "Tier 2", desc: "Solid middle. Rich non-English markets and fast-growing economies: lower prices, good volume." },
  { id: 3, label: "Tier 3", desc: "Lowest ad value. Big audiences and the cheapest reach, but the smallest budgets and in-game spending. Countries that are not listed count here." },
];

// ISO 3166-1 alpha-2, lower case, like the ids in lib/targeting.js.
const LISTED = {
  1: "us ca gb au nz ie de nl be lu at ch se no dk fi is fr jp kr",
  2: "es it pt sg hk tw il ae sa qa kw cz pl sk si hu ee lv lt gr cy mt hr ro bg rs tr mx br ar cl uy cr pa my th za",
  3: "in id ph vn pk bd lk np eg ma dz tn ng ke gh et tz ug co pe ec bo py ve ua kz uz ge am az jo iq lb kh mm la",
};

export const LISTED_TIERS = Object.fromEntries(Object.entries(LISTED).map(([tier, ids]) => [tier, ids.split(" ")]));

const TIER_OF = new Map(Object.entries(LISTED_TIERS).flatMap(([tier, ids]) => ids.map((id) => [id, Number(tier)])));

/** The tier (1, 2 or 3) of a country id. A country that is not listed is Tier 3. */
export function tierOf(id) {
  return TIER_OF.get(String(id).toLowerCase()) ?? 3;
}

/** The countries split into the three tiers, each list alphabetical: [{ tier, label, desc, countries: [{ id, label }] }]. */
export function countriesByTier(options = COUNTRIES) {
  return TIERS.map((tier) => ({ ...tier, countries: options.filter((option) => tierOf(option.id) === tier.id) }));
}

/** How many of these country ids sit in each tier: { 1: n, 2: n, 3: n }. Unknown ids are counted by their tier too. */
export function tierCounts(ids) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const id of new Set(ids ?? [])) counts[tierOf(id)] += 1;
  return counts;
}

/** "Tier 1 · 2, Tier 3 · 5" for a list of country ids; "" for none. */
export function tierSummary(ids) {
  const counts = tierCounts(ids);
  return TIERS.filter((tier) => counts[tier.id] > 0).map((tier) => `${tier.label} · ${counts[tier.id]}`).join(", ");
}

/** "none" | "some" | "all": how much of a list of country ids is in the picked ids. */
export function pickState(listIds, picked) {
  const have = new Set(picked ?? []);
  const n = listIds.filter((id) => have.has(id)).length;
  return n === 0 ? "none" : n === listIds.length ? "all" : "some";
}

/** Pick or drop a whole list of country ids at once. A list that is all picked is dropped, anything less is completed. */
export function toggleList(listIds, picked) {
  const have = new Set(picked ?? []);
  if (pickState(listIds, picked) === "all") return [...have].filter((id) => !listIds.includes(id));
  return [...new Set([...have, ...listIds])];
}

/** Which mode a campaign's country lists are in: "all" (no country limit), "only" (countries aimed at) or "except" (countries skipped). */
export function countryMode({ countries = [], exclude_countries: skipped = [] } = {}) {
  if (countries.length > 0) return "only";
  return skipped.length > 0 ? "except" : "all";
}

/** The country ids a campaign can reach: the picked ones, everything but the skipped ones, or every country. */
export function reachedCountries({ countries = [], exclude_countries: skipped = [] } = {}, options = COUNTRIES) {
  if (countries.length > 0) return countries.filter((id) => !skipped.includes(id));
  const skip = new Set(skipped);
  return options.map((option) => option.id).filter((id) => !skip.has(id));
}

/** How many of these games have players in each tier of the reached countries: [{ id, label, games }]. A game with players in several tiers counts in each. */
export function gamesByTier(profiles, reached) {
  const inside = new Set(reached);
  return TIERS.map((tier) => ({
    id: tier.id,
    label: tier.label,
    games: profiles.filter((profile) => (profile?.countries ?? []).some((id) => tierOf(id) === tier.id && inside.has(id))).length,
  }));
}
