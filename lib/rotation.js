// Which creative a placement shows for one session.
//
// A placement can carry many active booking assignments (advertisers rotating) and at
// most one active "own" assignment (the developer's own creative, the fallback).
// Pick: if any booking is live, choose one advertiser with equal chance, then one of that
// advertiser's creatives with equal chance. Otherwise the developer's own creative.
// A placement is never returned twice. Pure: the random source is injectable for tests.

export function pickForPlacement(rows, random = Math.random) {
  const bookings = rows.filter((row) => row.source === "booking");
  if (bookings.length > 0) {
    const byAdvertiser = new Map();
    for (const row of bookings) {
      const key = row.advertiserId ?? row.creativeId;
      if (!byAdvertiser.has(key)) byAdvertiser.set(key, []);
      byAdvertiser.get(key).push(row);
    }
    const groups = [...byAdvertiser.values()];
    const group = groups[Math.min(groups.length - 1, Math.floor(random() * groups.length))];
    return group[Math.min(group.length - 1, Math.floor(random() * group.length))];
  }
  return rows.find((row) => row.source !== "booking") ?? null;
}

/** rows: [{ placementId, source, advertiserId, creativeId, ... }] -> one row per placement. */
export function rotate(rows, random = Math.random) {
  const byPlacement = new Map();
  for (const row of rows) {
    if (!byPlacement.has(row.placementId)) byPlacement.set(row.placementId, []);
    byPlacement.get(row.placementId).push(row);
  }
  const picked = [];
  for (const group of byPlacement.values()) {
    const row = pickForPlacement(group, random);
    if (row) picked.push(row);
  }
  return picked;
}
