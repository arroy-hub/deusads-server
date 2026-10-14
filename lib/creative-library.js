import { FORMATS } from "./formats.js";
import { normalizeCrop } from "./surface-math.js";

// Rules for the advertiser's creative library (folders, own order, framing per ad shape; migration 0028).
// Pure: no database, so they can be tested on their own (test/creative-library.test.mjs).

export const MAX_FOLDER_NAME = 80;

/** A folder name from the browser: trimmed, one line, at most 80 characters; "" when nothing is left. */
export function cleanFolderName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FOLDER_NAME);
}

/**
 * The library order: the advertiser's own order first (sort_index 0, 1, 2 ...), then creatives nobody has put in
 * order, newest first. Rows are { id, sort_index, created_at }. Returns a new array.
 */
export function orderCreatives(rows) {
  return [...rows].sort((a, b) => {
    const left = a.sort_index ?? Number.POSITIVE_INFINITY;
    const right = b.sort_index ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left < right ? -1 : 1;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || String(a.id).localeCompare(String(b.id));
  });
}

/**
 * The ids with one of them moved in front of another (or to the end when `beforeId` is empty or unknown).
 * Unknown ids leave the order as it is.
 */
export function moveInOrder(ids, id, beforeId = null) {
  if (!ids.includes(id)) return [...ids];
  const rest = ids.filter((item) => item !== id);
  const at = beforeId && beforeId !== id ? rest.indexOf(beforeId) : -1;
  if (at < 0) return [...rest, id];
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * The advertiser's framing per ad shape as it is stored: only standard format ids, each a valid crop.
 * Anything else is dropped, so the column never holds garbage. Returns null when nothing is left.
 */
export function cleanFormatCrops(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out = {};
  for (const format of FORMATS) {
    const raw = input[format.id];
    if (!raw || typeof raw !== "object") continue;
    if (![raw.zoom, raw.x, raw.y].every((value) => Number.isFinite(Number(value)))) continue;
    out[format.id] = normalizeCrop(raw);
  }
  return Object.keys(out).length ? out : null;
}
