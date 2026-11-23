// Earnings on the Performance tabs: the paid impressions of the wallet's books (migration 0061), cut the same way the
// tab cuts views. The database functions of the tab are left as they are; what was paid is filled in here.
// Pure: no database, so it is tested without one (test/performance-earnings.test.mjs).

import { REMOVED, emptyCell, labelOf, valuesOf } from "./performance-view.js";
import { paidByDay, paidCampaigns, paidIndex, paidOf } from "./wallet.js";

const day = (value) => String(value ?? "").slice(0, 10);

/** Paid impressions of a scope per place type, most first: [{ label, impressions }]. */
export function paidTypes(scope, index, items) {
  if (!scope || !index) return [];
  const typeOf = new Map((items ?? []).map((item) => [item.id, labelOf("type", valuesOf(item, "type")[0], {})]));
  const members = scope.all ? [...index.byPlacement.keys()].map((placement) => ({ placement })) : scope.members ?? [];
  const sum = new Map();
  for (const member of members) {
    const n = paidOf({ members: [member] }, index);
    if (!n) continue;
    const label = typeOf.get(member.placement) ?? labelOf("type", REMOVED, {});
    sum.set(label, (sum.get(label) ?? 0) + n);
  }
  return [...sum].map(([label, impressions]) => ({ label, impressions })).sort((a, b) => b.impressions - a.impressions || a.label.localeCompare(b.label));
}

/**
 * Writes what was paid into the answers of game_performance() and says what the Earned block and its widgets need.
 *   paid       what loadGamePaid() answered ({ places, campaigns }), or null when there is no wallet yet
 *   scopes     every scope that was asked for ([{ key, all } | { key, members }])
 *   cellOf     Map scopeKey -> cell; each cell gets `paid`
 *   chartKey   the key of the scope the figures and the chart count
 *   dayRows    the by-day rows of that scope; each gets `paid`
 *   items      the placements of the game (for the place types)
 * Returns { on: false } without a wallet, else { on: true, campaigns, types }.
 */
export function applyPaid({ paid, scopes, cellOf, chartKey, dayRows, items }) {
  if (!paid) return { on: false, campaigns: [], types: [] };
  const index = paidIndex(paid.places);
  for (const scope of scopes ?? []) {
    const n = paidOf(scope, index);
    const cell = cellOf.get(scope.key);
    if (cell) cell.paid = n;
    else if (n > 0) cellOf.set(scope.key, { ...emptyCell(), paid: n });
  }
  const chart = (scopes ?? []).find((scope) => scope.key === chartKey) ?? null;
  for (const row of dayRows ?? []) row.paid = paidByDay(chart, index, [day(row.day)])[0];
  return { on: true, campaigns: paidCampaigns(chart, paid.campaigns), types: paidTypes(chart, index, items) };
}
