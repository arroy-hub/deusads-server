import assert from "node:assert/strict";
import { packSpans, perRow, COLS } from "../lib/deck-pack.js";

const autos = (n, weights = []) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, weight: weights[i] }));
const order = (items, spans) => items.map((item) => spans[item.key]);
/** the rows the grid makes of spans in order */
function rowsOf(list) {
  const rows = [[]];
  let used = 0;
  for (const span of list) {
    if (used + span > COLS) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(span);
    used += span;
  }
  return rows;
}

assert.equal(perRow(0), 2, "not measured: two across");
assert.equal(perRow(500), 2);
assert.equal(perRow(676), 3);
assert.equal(perRow(1400), 3, "never more than three");

// ---- the rule: whatever the width and the number of cards, rows are full, hold at least two cards, and no card is under 3 columns
for (const width of [0, 320, 400, 520, 675, 676, 900, 1400, 2000]) {
  for (let n = 2; n <= 14; n++) {
    for (const weights of [[], [8, 4, 4, 6, 8, 3, 5, 12, 4, 4, 4, 6, 6, 3]]) {
      const items = autos(n, weights);
      const list = order(items, packSpans(items, width));
      assert.ok(list.every((span) => Number.isInteger(span) && span >= 3), `spans ok (n=${n}, width=${width}): ${list}`);
      const rows = rowsOf(list);
      for (const row of rows) {
        assert.equal(row.reduce((a, b) => a + b, 0), COLS, `a row fills the board (n=${n}, width=${width}): ${list}`);
        const last = row === rows[rows.length - 1];
        assert.ok(row.length >= 2 || (last && width < 466), `one card on a row only as the odd one out of a narrow board (n=${n}, width=${width}): ${list}`);
        assert.ok(row.length <= 3, `rows are not crowded (n=${n}, width=${width}): ${list}`);
        if (width >= 466) assert.ok(row.every((span) => (span * (width - 11 * 8)) / 12 + (span - 1) * 8 >= 149), `no card under 150 px (n=${n}, width=${width}): ${list}`);
      }
    }
  }
}

// ---- the usual cases
assert.deepEqual(order(autos(4), packSpans(autos(4), 500)), [6, 6, 6, 6], "narrow board, 4 cards: two by two");
assert.deepEqual(order(autos(5), packSpans(autos(5), 500)), [6, 6, 4, 4, 4], "narrow board, 5 cards: 2 and 3, not 2, 2 and 1");
assert.deepEqual(order(autos(5), packSpans(autos(5), 400)), [6, 6, 6, 6, 12], "a side panel of 400 px: two across, the odd one out alone, never three of 120 px");
assert.deepEqual(order(autos(3), packSpans(autos(3), 380)), [6, 6, 12]);
assert.deepEqual(order(autos(3), packSpans(autos(3), 520)), [4, 4, 4], "from 466 px three of 150 px are fine");
assert.deepEqual(order(autos(5), packSpans(autos(5), 900)), [4, 4, 4, 6, 6], "wide board, 5 cards: 3 and 2");
assert.deepEqual(order(autos(7), packSpans(autos(7), 900)), [4, 4, 4, 6, 6, 6, 6], "7 cards: 3, 2 and 2, not 3, 3 and 1");
assert.deepEqual(order(autos(6), packSpans(autos(6), 900)), [4, 4, 4, 4, 4, 4]);
assert.deepEqual(packSpans(autos(1), 900), { k0: 12 }, "a single card has the whole board");
assert.deepEqual(order(autos(2, [8, 4]), packSpans(autos(2, [8, 4]), 500)), [7, 5], "a card that wants more room gets more, within the row");
assert.deepEqual(order(autos(2, [3, 3]), packSpans(autos(2, [3, 3]), 500)), [6, 6], "equal wishes share equally");

// ---- widths set by hand are kept; the cards around them fill the rest of the row
const mixed = [{ key: "a", fixed: 12 }, { key: "b" }, { key: "c" }, { key: "d" }];
assert.deepEqual(order(mixed, packSpans(mixed, 900)), [12, 4, 4, 4], "a card set to the full width stays that wide");
const side = [{ key: "a", fixed: 4 }, { key: "b" }, { key: "c" }];
assert.deepEqual(order(side, packSpans(side, 500)), [4, 4, 4], "a hand-set 4 and two others: 4, 4 and 4");
const wide = [{ key: "a", fixed: 8 }, { key: "b" }, { key: "c" }];
assert.deepEqual(order(wide, packSpans(wide, 500)), [8, 4, 12], "a hand-set 8 leaves room for one card; the odd one out after it has its row (the person's widths decide that)");
assert.equal(packSpans([{ key: "a", fixed: 3 }, { key: "b" }], 400).a, 5, "a narrow board does not squeeze a hand-set width below about 150 px");
assert.equal(packSpans([{ key: "a", fixed: 3 }, { key: "b" }], 1400).a, 3, "a wide one keeps it");
assert.deepEqual(packSpans([{ key: "a", fixed: 99 }], 900), { a: 12 });

console.log("deck-pack tests passed");
