import assert from "node:assert/strict";
import { REASONS, fillTable, loadGameFillRate, slotStates } from "../lib/fill-rate.js";

const item = (placementId, source = "booking") => ({ placementId, source });

// each placement is explained by how far its creatives got through the manifest
{
  const a = item("a");
  const b = item("b");
  const c = item("c", "own");
  const d = item("d");
  const e = item("e");
  const f = item("f");
  const states = slotStates({
    slots: ["a", "b", "c", "d", "e", "f", "g", "off"],
    disabled: ["off"],
    // assigned, fitting the audience, with a picture, advertiser not suspended, not blocked
    levels: [[a, b, c, d, e, f, item("off")], [a, c, d, e, f], [a, c, e, f], [a, c, f], [a, c]],
    chosen: [a, c],
  });
  assert.deepEqual(states, { a: "ad", b: "targeting", c: "own", d: "no_picture", e: "suspended", f: "blocked", g: "no_ad" });
}

// a creative dropped by the campaign's own rules is the last step
{
  const a = item("a");
  const states = slotStates({ slots: ["a"], disabled: new Set(), levels: [[a], [a], [a], [a], [a]], chosen: [] });
  assert.deepEqual(states, { a: "campaign" });
}

// several creatives on one placement: the one that got furthest explains it
{
  const states = slotStates({
    slots: ["a"],
    disabled: [],
    levels: [[item("a"), item("a")], [item("a")], [], [], []],
    chosen: [],
  });
  assert.deepEqual(states, { a: "no_picture" });
}

// a request with no placements records nothing
assert.deepEqual(slotStates({ slots: [], disabled: [], levels: [[], [], [], [], []], chosen: [] }), {});

// every reason is a column of the table, none twice
assert.deepEqual(REASONS.map((reason) => reason.key), ["no_ad", "targeting", "no_picture", "suspended", "blocked", "campaign"]);

// the table: totals, shares of the empty slots, emptiest placement first
{
  const table = fillTable([
    { external_id: "bottle", label: "Bottle", offered: "10", filled_ad: "6", filled_own: "2", no_ad: "2", targeting: "0", no_picture: "0", suspended: "0", blocked: "0", campaign: "0" },
    { external_id: "poster", label: null, offered: 20, filled_ad: 0, filled_own: 5, no_ad: 5, targeting: 8, no_picture: 2, suspended: 0, blocked: 0, campaign: 0 },
    { external_id: "coin", label: "Coin", offered: 0, filled_ad: 0, filled_own: 0, no_ad: 0, targeting: 0, no_picture: 0, suspended: 0, blocked: 0, campaign: 0 },
  ]);
  assert.equal(table.totals.offered, 30);
  assert.equal(table.totals.filledAd, 6);
  assert.equal(table.totals.filledOwn, 7);
  assert.equal(table.totals.empty, 17);
  assert.equal(table.totals.rate, 13 / 30);
  assert.equal(table.totals.adRate, 6 / 30);
  assert.equal(table.totals.mainReason.key, "targeting");
  assert.deepEqual(table.places.map((place) => place.name), ["poster", "Bottle", "Coin"], "emptiest first, no data last");
  assert.equal(table.places[0].mainReason.key, "targeting");
  assert.equal(table.places[1].rate, 0.8);
  assert.equal(table.places[2].rate, null);
  assert.equal(table.places[2].mainReason, null);
  const share = Object.fromEntries(table.reasons.map((reason) => [reason.key, reason.share]));
  assert.equal(share.no_ad, 7 / 17);
  assert.equal(share.targeting, 8 / 17);
  assert.equal(share.suspended, 0);
}

// no data yet: no rate is made up
{
  const table = fillTable([]);
  assert.equal(table.totals.offered, 0);
  assert.equal(table.totals.rate, null);
  assert.equal(table.reasons.every((reason) => reason.share === null), true);
}

// the loader: an error means the migration is missing and the panel stays off
{
  const missing = await loadGameFillRate(async () => ({ data: null, error: { code: "PGRST202" } }));
  assert.equal(missing.missing, true);
  const loaded = await loadGameFillRate(async () => ({ data: [{ external_id: "a", label: "A", offered: 4, filled_ad: 4, filled_own: 0, no_ad: 0, targeting: 0, no_picture: 0, suspended: 0, blocked: 0, campaign: 0 }], error: null }));
  assert.equal(loaded.missing, false);
  assert.equal(loaded.totals.rate, 1);
}

console.log("fill rate: all checks passed");
