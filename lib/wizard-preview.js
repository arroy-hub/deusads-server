// The 'How it will look' preview of the new-campaign wizard: for each standard shape, which picture of the picked creatives
// shows there, and which creative a missing shape should be added to. Pure, so it can be tested.
//   creatives: [{ id, url, width, height, safe, assets: [{ formatId, aspect, status, url }] }]

import { FORMATS, coverageByFormat } from "./formats.js";

const shapeOf = (item) => ({ aspect: item?.width && item?.height ? item.width / item.height : null, safeZone: item?.safe ?? undefined });

/**
 * One row per standard shape: { format, kind: "asset" | "crop" | "none", url, by }.
 * Pictures of the creatives are taken together: a shape is covered when any of them covers it. A picture made for the shape
 * (an own one, approved) wins over an automatic crop, and the tile shows that picture itself; an automatic crop shows the main
 * image of the creative that covers the shape. `by` is the id of that creative.
 */
export function previewCover(creatives) {
  const covers = creatives.map((creative) => coverageByFormat({ creative: shapeOf(creative), assets: creative.assets ?? [] }));
  return FORMATS.map((format) => {
    const rows = covers.map((cv) => cv.find((r) => r.format.id === format.id));
    const own = rows.findIndex((r) => r?.kind === "asset");
    const at = own >= 0 ? own : rows.findIndex((r) => r && r.kind !== "none");
    if (at < 0) return { format, kind: "none", url: "", by: null };
    const row = rows[at];
    return { format, kind: row.kind, url: (row.kind === "asset" && row.asset?.url) || creatives[at].url || "", by: creatives[at].id };
  });
}

/** How many of the standard shapes this creative covers by itself (its own pictures or an automatic crop). */
export function shapesCovered(creative) {
  return coverageByFormat({ creative: shapeOf(creative), assets: creative.assets ?? [] }).filter((r) => r.kind !== "none").length;
}

/** The creative a missing shape is added to: the one that already covers the most shapes (the first of equals). */
export function creativeToComplete(creatives) {
  return creatives.reduce((best, creative) => (shapesCovered(creative) > shapesCovered(best) ? creative : best), creatives[0] ?? null);
}
