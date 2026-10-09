import { pickImage } from "./formats.js";
import { cropFromRow } from "./surface-math.js";

/**
 * Which assignment rows can be served, and with which picture.
 * The developer's own creative keeps its assignment framing. A booked creative gets the
 * picture lib/formats.js picks for the placement's shape; where none fits, the row is
 * dropped (before the rotation), so the placement shows someone else or the fallback.
 * `rows` are assignment rows with creatives / placements embedded; `assetsOf` maps a
 * creative id to its approved per-format images; `urlFor` turns a storage path into a URL.
 */
export function choosePictures(rows, assetsOf, urlFor) {
  const shown = new Map();
  const servable = [];
  for (const item of rows) {
    const { row } = item;
    const creative = row.creatives;
    if (item.source !== "booking" || !creative.width_px) {
      shown.set(row, { imageUrl: urlFor(creative.storage_path), crop: cropFromRow(row) });
      servable.push(item);
      continue;
    }
    const pick = pickImage({
      creative: {
        aspect: creative.width_px && creative.height_px ? creative.width_px / creative.height_px : null,
        safeZone: { x: creative.safe_x, y: creative.safe_y, w: creative.safe_w, h: creative.safe_h },
      },
      assets: assetsOf.get(creative.id) ?? [],
      surfaceAspect: Number(row.placements.aspect_ratio),
    });
    if (pick.kind === "none") continue;
    shown.set(row, {
      imageUrl: urlFor(pick.kind === "asset" ? pick.asset.storagePath : creative.storage_path),
      crop: pick.crop,
    });
    servable.push(item);
  }
  return { servable, shown };
}
