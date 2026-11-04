// The 'How it will look' preview of the new-campaign wizard: for each standard shape, which picture of the picked creatives
// shows there, and which creative a missing shape should be added to. Pure, so it can be tested.
//   creatives: [{ id, url, width, height, safe, assets: [{ formatId, aspect, status, url }] }]

import { FORMATS, coverageByFormat } from "./formats.js";

const shapeOf = (item) => ({ aspect: item?.width && item?.height ? item.width / item.height : null, safeZone: item?.safe ?? undefined });

/**
 * One row per standard shape: { format, kind: "asset" | "crop" | "none", url, by, shows }.
 * Pictures of the creatives are taken together: a shape is covered when any of them covers it. A picture made for the shape
 * (an own one, approved) wins over an automatic crop, and the tile shows that picture itself; an automatic crop shows the main
 * image of the creative that covers the shape. `by` is the id of the creative shown first; `shows` lists every creative that
 * covers the shape, in the order they were picked: [{ id, kind, url }] (the tile can be paged through them).
 */
export function previewCover(creatives) {
  const covers = creatives.map((creative) => coverageByFormat({ creative: shapeOf(creative), assets: creative.assets ?? [] }));
  return FORMATS.map((format) => {
    const shows = [];
    covers.forEach((cv, index) => {
      const row = cv.find((r) => r.format.id === format.id);
      if (!row || row.kind === "none") return;
      shows.push({ id: creatives[index].id, kind: row.kind, url: (row.kind === "asset" && row.asset?.url) || creatives[index].url || "" });
    });
    const first = shows.find((show) => show.kind === "asset") ?? shows[0];
    if (!first) return { format, kind: "none", url: "", by: null, shows: [] };
    return { format, kind: first.kind, url: first.url, by: first.id, shows };
  });
}

/**
 * What a tile shows once the person paged to creative `id` (an unknown or missing id gives the first one): the entry of
 * `row.shows` with `by` (its creative), `position` (1-based) and `total` (the creatives that cover the shape); null when none does.
 */
export function showing(row, id = null) {
  const shows = row?.shows ?? [];
  if (shows.length === 0) return null;
  let at = shows.findIndex((show) => show.id === id);
  if (at < 0) at = shows.findIndex((show) => show.id === row.by);
  if (at < 0) at = 0;
  return { ...shows[at], by: shows[at].id, position: at + 1, total: shows.length };
}

/** The creative one step further (`direction` 1) or back (-1) in a tile, going round at the ends; the same one when it is alone. */
export function stepShowing(row, id, direction) {
  const current = showing(row, id);
  if (!current) return null;
  if (current.total < 2) return current.by;
  return row.shows[(current.position - 1 + (direction < 0 ? -1 : 1) + current.total) % current.total].id;
}

/** How many of the standard shapes this creative covers by itself (its own pictures or an automatic crop). */
export function shapesCovered(creative) {
  return coverageByFormat({ creative: shapeOf(creative), assets: creative.assets ?? [] }).filter((r) => r.kind !== "none").length;
}

/** The creative a missing shape is added to: the one that already covers the most shapes (the first of equals). */
export function creativeToComplete(creatives) {
  return creatives.reduce((best, creative) => (shapesCovered(creative) > shapesCovered(best) ? creative : best), creatives[0] ?? null);
}

/**
 * What can be done about a shape nobody covers: the picked creatives it can be added to (the one that covers the most shapes
 * first, equals in the order they were picked), each as { id, name, number, covered, total }. Uploading a new creative is the
 * other choice and is not in this list.
 */
export function completionOptions(creatives) {
  return creatives
    .map((creative, index) => ({ id: creative.id, name: creative.name ?? "", number: index + 1, covered: shapesCovered(creative), total: FORMATS.length }))
    .sort((a, b) => b.covered - a.covered || a.number - b.number);
}

/** The library creatives that can still be added to the campaign: not rejected, not picked yet; the order of the library. */
export function addableCreatives(library, pickedIds) {
  const picked = new Set(pickedIds ?? []);
  return (library ?? []).filter((creative) => creative.status !== "rejected" && !picked.has(creative.id));
}
