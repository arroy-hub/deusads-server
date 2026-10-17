// Interactions (migration 0036): how often the player took hold of, pressed or clicked the object an ad is on.
// Only placements the developer marked Interactive count, so a large banner nobody touches never drags the rate down.
// The rate is views with at least one interaction over views on interactive placements: it cannot pass 100%.
// Pure, so the rules are tested without a database (test/interactions.test.mjs).

const number = (value) => Number(value ?? 0) || 0;

/** Placement rows of game_interactions() -> totals and a table, busiest first. */
export function interactionTable(rows) {
  const places = (rows ?? []).map((row) => {
    const views = number(row.views);
    const interacted = number(row.interacted);
    return {
      id: row.placement_id ?? row.external_id,
      name: row.label || row.external_id || "Placement",
      views,
      interacted,
      interactions: number(row.interactions),
      rate: views > 0 ? interacted / views : null,
    };
  });
  const totals = totalsOf({
    placements: places.length,
    views: places.reduce((sum, place) => sum + place.views, 0),
    interacted: places.reduce((sum, place) => sum + place.interacted, 0),
    interactions: places.reduce((sum, place) => sum + place.interactions, 0),
  });
  places.sort((a, b) => b.views - a.views || (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name));
  return { totals, places };
}

/** { placements, views, interacted, interactions } -> the same plus rate and interactions per interacted view. */
export function totalsOf(row) {
  const views = number(row?.views);
  const interacted = number(row?.interacted);
  const interactions = number(row?.interactions);
  return {
    placements: number(row?.placements),
    views,
    interacted,
    interactions,
    rate: views > 0 ? interacted / views : null,
    perInteracted: interacted > 0 ? interactions / interacted : null,
  };
}

/** Developer: { rows, totals, places, missing }. missing = migration 0036 is not applied (the panel stays off). */
export async function loadGameInteractions(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, totals: totalsOf(null), places: [] };
  const table = interactionTable(result.data);
  return { missing: false, totals: table.totals, places: table.places };
}

/** Advertiser: { totals, places: [], missing }. The advertiser sees totals only. */
export async function loadAdvertiserInteractions(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, totals: totalsOf(null), places: [] };
  return { missing: false, totals: totalsOf(result.data?.[0]), places: [] };
}
