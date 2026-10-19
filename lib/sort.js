// Sortable table headers for the admin tables. A first click sorts in the column's natural direction
// (text A→Z, numbers high→low), a second click turns it around, a third puts the table back in its own order.

/** The next sort after a click on `key`. `current` is `{ key, dir }` or null; `defaults` maps key → "asc" | "desc". */
export function nextSort(current, key, defaults = {}) {
  const first = defaults[key] === "desc" ? "desc" : "asc";
  if (!current || current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

/** The value a row is compared by: numbers stay numbers, text is compared without case. */
const comparable = (value) => (typeof value === "number" ? value : value == null ? "" : String(value).toLowerCase());

/** Rows sorted by `sort` ({ key, dir } or null = untouched order). `pick(row, key)` returns the cell value; empty cells always sink. */
export function sortRows(rows, sort, pick = (row, key) => row[key]) {
  if (!sort) return rows;
  const sign = sort.dir === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: comparable(pick(row, sort.key)) }))
    .sort((a, b) => {
      const aEmpty = a.value === "", bEmpty = b.value === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      const order = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : String(a.value).localeCompare(String(b.value), "en", { numeric: true });
      return sign * order || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** aria-sort for a header cell. */
export const ariaSort = (sort, key) => (sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
