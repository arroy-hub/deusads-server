// Fill rate (migration 0037): every time a game starts it asks the server which ad each placement shows (the manifest).
// A placement that gets an ad is filled; one that does not is empty, and the server knows why. Counted per placement
// and day, so the developer sees how much of the inventory is sold and what keeps the rest empty.
// A slot is one placement in one manifest request. Placements the developer switched off are not slots.
// Pure, so the rules are tested without a database (test/fill-rate.test.mjs).

const number = (value) => Number(value ?? 0) || 0;

/** Why a slot stays empty, in the order the manifest drops creatives. `key` is also the column of manifest_fill. */
export const REASONS = [
  { key: "no_ad", label: "Nothing booked", hint: "No advertiser's ad and none of your own creatives is assigned to the placement." },
  { key: "targeting", label: "Audience does not fit", hint: "The booked creatives ask for another kind of game (genre, platform or language)." },
  { key: "no_picture", label: "No picture in this shape", hint: "The booked creatives have no picture in the shape of the placement." },
  { key: "suspended", label: "Advertiser suspended", hint: "The advertiser's account is suspended." },
  { key: "blocked", label: "Blocked or paused by you", hint: "You paused or blocked these ads in this game." },
  { key: "campaign", label: "Campaign rules", hint: "The campaign is paused, aims at another audience or skips this game." },
];

// The reason a creative that got as far as level k was dropped at the next step.
const DROPPED_BY = ["targeting", "no_picture", "suspended", "blocked", "campaign"];

/**
 * What happened to each placement of one manifest request: { externalId: state }.
 *   slots     external ids of the game's live placements
 *   disabled  external ids the developer switched off (left out: nobody expects an ad there)
 *   levels    the manifest's candidates after each step, widest first:
 *             [assigned, fitting the audience, with a picture, advertiser not suspended, not blocked]
 *   chosen    the items finally served, one per placement
 * state is "ad" (an advertiser's), "own" (the developer's), or the reason (a key of REASONS).
 */
export function slotStates({ slots, disabled, levels, chosen }) {
  const off = disabled instanceof Set ? disabled : new Set(disabled ?? []);
  const reached = levels.map((items) => new Set(items.map((item) => item.placementId)));
  const served = new Map(chosen.map((item) => [item.placementId, item]));
  const states = {};
  for (const id of slots) {
    if (off.has(id)) continue;
    const item = served.get(id);
    if (item) {
      states[id] = item.source === "booking" ? "ad" : "own";
      continue;
    }
    let level = -1;
    reached.forEach((ids, k) => {
      if (ids.has(id)) level = k;
    });
    states[id] = level < 0 ? "no_ad" : DROPPED_BY[Math.min(level, DROPPED_BY.length - 1)];
  }
  return states;
}

/** One row of game_fill_rate() -> a place of the table. */
function placeOf(row) {
  const offered = number(row.offered);
  const filledAd = number(row.filled_ad);
  const filledOwn = number(row.filled_own);
  const reasons = {};
  for (const reason of REASONS) reasons[reason.key] = number(row[reason.key]);
  const empty = Object.values(reasons).reduce((sum, value) => sum + value, 0);
  const main = REASONS.reduce((best, reason) => (reasons[reason.key] > (best ? reasons[best.key] : 0) ? reason : best), null);
  return {
    id: row.external_id,
    name: row.label || row.external_id || "Placement",
    offered,
    filledAd,
    filledOwn,
    empty,
    reasons,
    mainReason: main,
    rate: offered > 0 ? (filledAd + filledOwn) / offered : null,
    adRate: offered > 0 ? filledAd / offered : null,
  };
}

/** Rows of game_fill_rate() -> { totals, places, reasons }. Places: emptiest first. */
export function fillTable(rows) {
  const places = (rows ?? []).map(placeOf);
  const offered = places.reduce((sum, place) => sum + place.offered, 0);
  const filledAd = places.reduce((sum, place) => sum + place.filledAd, 0);
  const filledOwn = places.reduce((sum, place) => sum + place.filledOwn, 0);
  const reasons = REASONS.map((reason) => ({
    ...reason,
    slots: places.reduce((sum, place) => sum + place.reasons[reason.key], 0),
  }));
  const empty = reasons.reduce((sum, reason) => sum + reason.slots, 0);
  for (const reason of reasons) reason.share = empty > 0 ? reason.slots / empty : null;
  const main = reasons.reduce((best, reason) => (reason.slots > (best ? best.slots : 0) ? reason : best), null);
  places.sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.offered - a.offered || a.name.localeCompare(b.name));
  return {
    totals: {
      placements: places.length,
      offered,
      filledAd,
      filledOwn,
      empty,
      rate: offered > 0 ? (filledAd + filledOwn) / offered : null,
      adRate: offered > 0 ? filledAd / offered : null,
      mainReason: main,
    },
    places,
    reasons,
  };
}

/** Developer: { missing, totals, places, reasons }. missing = migration 0037 is not applied (the panel stays off). */
export async function loadGameFillRate(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, ...fillTable([]) };
  return { missing: false, ...fillTable(result.data) };
}
