// How the cards of a widget board share its width. The boards are a grid of 12 columns; what a card gets is worked out from the
// width of the board itself, not of the window, so the board always fills its field edge to edge and never drops to one card
// per row by itself: two across when the board is narrow, three when three still read well. A width the person set by hand
// (a resized card) is kept; every other card takes what is left of its row. Used by every board (MetricsDeck, the admin deck).

export const COLS = 12;
export const GAP = 8;
const MIN_AUTO = 3; // no card gets fewer than 3 of the 12 columns
const THREE_AT = 3 * 220 + 2 * GAP; // from this board width on, three cards of at least 220 px fit a row
const FIXED_MIN_PX = 150; // a hand-set width is never squeezed below this

/** Cards per row for a board this wide (px): 3 when three fit, otherwise 2 (also while the board is not measured yet). */
export const perRow = (width) => (width >= THREE_AT ? 3 : 2);

/** `total` columns shared out in whole numbers, at least MIN_AUTO each, in proportion to `weights`. */
function share(total, weights) {
  const n = weights.length;
  const left = total - MIN_AUTO * n;
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (left * w) / sum);
  const out = raw.map((v) => MIN_AUTO + Math.floor(v));
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Spans (out of 12) for cards in their order on a board `width` px wide.
 *   items: [{ key, fixed?, weight? }]   `fixed`: a width the person chose (kept, only kept from getting too narrow);
 *                                       `weight`: how much of a row the card would like next to others (3..8, default 4)
 * Returns { [key]: span }. A row that holds cards without a hand-set width always adds up to 12, and has at least two
 * cards unless the board has only one card (or the neighbours were set by hand).
 */
export function packSpans(items, width = 0) {
  const per = perRow(width);
  const colW = width > 0 ? (width - (COLS - 1) * GAP) / COLS : 0;
  const fixedMin = width > 0 ? Math.min(COLS, Math.max(MIN_AUTO, Math.ceil((FIXED_MIN_PX + GAP) / (colW + GAP)))) : MIN_AUTO;
  const list = items.map((item) => ({
    key: item.key,
    fixed: Number.isFinite(item.fixed) ? Math.min(COLS, Math.max(fixedMin, Math.round(item.fixed))) : null,
    weight: Math.min(8, Math.max(MIN_AUTO, Number(item.weight) || 4)),
  }));

  // rows in the order the grid will lay the cards out
  const rows = [];
  let row = null;
  for (const item of list) {
    const need = item.fixed ?? MIN_AUTO;
    const fits = row && row.min + need <= COLS && (item.fixed != null || row.autos < per);
    if (!fits) {
      row = { items: [], min: 0, autos: 0 };
      rows.push(row);
    }
    row.items.push(item);
    row.min += need;
    if (item.fixed == null) row.autos += 1;
  }

  // a card alone on its row, next to cards that were not set by hand: take one from the row above (3+1 -> 2+2) or join it (2+1 -> 3)
  for (let i = rows.length - 1; i >= 1; i--) {
    const alone = rows[i];
    const above = rows[i - 1];
    if (alone.items.length !== 1 || alone.items[0].fixed != null || above.items.some((x) => x.fixed != null)) continue;
    if (above.items.length >= 3) alone.items.unshift(above.items.pop());
    else if (above.items.length < 4) {
      above.items.push(alone.items[0]);
      rows.splice(i, 1);
    }
  }

  const spans = {};
  for (const r of rows) {
    const autos = r.items.filter((x) => x.fixed == null);
    const used = r.items.reduce((sum, x) => sum + (x.fixed ?? 0), 0);
    for (const x of r.items) if (x.fixed != null) spans[x.key] = x.fixed;
    if (autos.length) share(COLS - used, autos.map((x) => x.weight)).forEach((span, i) => { spans[autos[i].key] = span; });
  }
  return spans;
}
