// The comparison table of a campaign's report (migration 0043): one row per creative or per game, the same figures in each.
// Pure, so the rules are tested without a database (test/campaign-compare.test.mjs).

/** Below this many views a share or an average says too little, so the table shows a dash instead. */
export const MIN_VIEWS = 100;

const number = (value) => Number(value ?? 0) || 0;

/**
 * Figures of one row of advertiser_compare(), ready to draw. Anything that cannot be told yet is null.
 *   engaged   views of 3 s or more from within 3 m ÷ measured views
 *   viewable  measured views ÷ chances to be seen, at most 1
 *   touched   views where the player touched the object ÷ views on interactive objects
 *   hours     the time the ad was in view, summed
 *   players   different players; perPlayer how often one saw the ad
 * With fewer than MIN_VIEWS views the shares and perPlayer are null and `few` is true.
 */
export function compareFigures(row) {
  const impressions = number(row?.impressions);
  const measured = number(row?.measured);
  const opportunities = number(row?.opportunities);
  const interactive = number(row?.interactive);
  const players = number(row?.players);
  const few = impressions < MIN_VIEWS;
  return {
    few,
    engaged: !few && measured > 0 ? number(row.engaged) / measured : null,
    viewable: !few && measured > 0 && opportunities > 0 ? Math.min(1, measured / opportunities) : null,
    touched: !few && interactive > 0 ? number(row.touched) / interactive : null,
    hours: impressions > 0 ? number(row.visible_seconds) / 3600 : null,
    players: players > 0 ? players : null,
    perPlayer: !few && players > 0 ? number(row.player_views) / players : null,
  };
}

/** The rows of advertiser_compare() by kind: { creatives: { id: figures }, games: { id: figures } }. */
export function compareByKind(rows) {
  const out = { creatives: {}, games: {} };
  for (const row of rows ?? []) {
    if (row.kind === "creative") out.creatives[row.id] = compareFigures(row);
    else if (row.kind === "game") out.games[row.id] = compareFigures(row);
  }
  return out;
}
