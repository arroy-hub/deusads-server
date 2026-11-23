// The pictures a campaign really shows in a game (migration 0062). A creative shows a different picture on placements
// of different shapes: its own picture for a format, or its main picture cropped. One "picture" is a creative in one
// shape; the Campaigns tab of a game lists them, and a developer can block one without touching the others.
// Pure (no React, no database), so it can be tested. The same rule as the manifest: lib/formats.js picks the picture.

import { DEFAULT_CROP, ratioLabel } from "./surface-math.js";
import { FORMATS, formatOf, pickImage } from "./formats.js";

/** The shape of a placement whose game did not report one: the main picture is shown there as it is. */
export const ANY_SHAPE = "any";

const valid = (value) => Number.isFinite(value) && value > 0;

/**
 * The key of a placement's shape: the id of its standard format ("r16x9"), "x2.3" for a custom shape (one decimal, so
 * placements of nearly the same shape are one row), "any" when the shape is unknown.
 */
export function shapeKey(aspect) {
  const value = Number(aspect);
  if (!valid(value)) return ANY_SHAPE;
  return formatOf(value) ?? `x${(Math.round(value * 10) / 10).toFixed(1)}`;
}

/** Width / height of a shape key, or null for "any". */
export function shapeAspect(key) {
  const format = FORMATS.find((item) => item.id === key);
  if (format) return format.aspect;
  const custom = /^x(\d+(?:\.\d+)?)$/.exec(String(key ?? ""));
  return custom && valid(Number(custom[1])) ? Number(custom[1]) : null;
}

/** "16:9", "21:9", "2.60:1", or "Unknown shape". */
export function shapeLabel(key) {
  const format = FORMATS.find((item) => item.id === key);
  if (format) return format.label.split(" ")[0];
  const aspect = shapeAspect(key);
  return aspect ? ratioLabel(aspect) : "Unknown shape";
}

const SHAPE_KEY = /^(any|r\d+x\d+|x\d+(\.\d+)?)$/;
export const isShapeKey = (key) => SHAPE_KEY.test(String(key ?? ""));

/** One picture: a creative in one shape. The id is what a block of a picture is saved and logged under. */
export const pictureId = (creativeId, shape) => `${creativeId}:${shape}`;

/** { creativeId, shape } from a picture id, or null when it is not one. */
export function parsePictureId(id) {
  const text = String(id ?? "");
  const cut = text.indexOf(":");
  if (cut <= 0) return null;
  const shape = text.slice(cut + 1);
  return isShapeKey(shape) ? { creativeId: text.slice(0, cut), shape } : null;
}

/**
 * Which picture a creative shows on a placement of this shape: { kind: "asset", asset, crop } | { kind: "crop", crop } |
 * { kind: "none" }. A creative whose size was never measured shows its main picture as it is, as in the manifest.
 *   creative: { aspect, safeZone, formatCrops }   assets: approved pictures made for a format
 */
export function pictureFor({ creative, assets = [], aspect }) {
  if (!valid(Number(creative?.aspect))) return { kind: "crop", crop: { ...DEFAULT_CROP } };
  return pickImage({ creative, assets, surfaceAspect: Number(aspect) });
}

/** Does this creative show anything on a placement of this shape? */
export const landsOn = ({ creative, assets = [], aspect }) => pictureFor({ creative, assets, aspect }).kind !== "none";

/** True when showing the main picture in this shape cuts a visible part of it away (more than a sliver). */
export function isCropped(creativeAspect, surfaceAspect) {
  const a = Number(creativeAspect);
  const b = Number(surfaceAspect);
  return valid(a) && valid(b) && Math.abs(a / b - 1) > 0.04;
}

const ORDER = ["active", "waiting", "ended"];
const strongest = (bases) => ORDER.find((base) => bases.includes(base)) ?? "ended";
const shapeRank = (key) => {
  const aspect = shapeAspect(key);
  return aspect ? -aspect : 1; // widest first, the unknown shape last
};

/**
 * The pictures the bookings of one campaign put on the placements of a game: one entry per creative and shape that
 * lands on at least one placement. A booking whose creative has no picture for the placement's shape gives nothing.
 *   bookings     [{ creativeId, placementId, base }]   base: "active" | "waiting" | "ended"
 *   placementOf  Map(id -> { name, aspect })           aspect: width / height, null when the game did not report it
 *   creativeOf   Map(id -> { aspect, safeZone, formatCrops })
 *   assetsOf     Map(creativeId -> [{ id, formatId, aspect, status, storagePath }])
 * Returns [{ creativeId, shape, kind, asset, crop, aspect, base, placements: [{ id, name, base }] }], in the order the
 * creatives were booked, each creative's shapes from the widest to the tallest. `placements` lists where it is showing
 * or about to (or, when everything of it is over, where it was).
 */
export function landedPictures({ bookings = [], placementOf, creativeOf, assetsOf }) {
  const rows = new Map();
  const creativeOrder = [];
  for (const booking of bookings) {
    const placement = placementOf.get(booking.placementId);
    if (!placement) continue;
    const pick = pictureFor({ creative: creativeOf.get(booking.creativeId), assets: assetsOf.get(booking.creativeId) ?? [], aspect: placement.aspect });
    if (pick.kind === "none") continue;
    const shape = shapeKey(placement.aspect);
    const id = pictureId(booking.creativeId, shape);
    if (!rows.has(id)) {
      if (!creativeOrder.includes(booking.creativeId)) creativeOrder.push(booking.creativeId);
      rows.set(id, { creativeId: booking.creativeId, shape, kind: pick.kind, asset: pick.asset ?? null, crop: pick.crop, aspect: valid(Number(placement.aspect)) ? Number(placement.aspect) : null, spots: new Map() });
    }
    const spots = rows.get(id).spots;
    const known = spots.get(booking.placementId);
    // several bookings of one creative on one placement (booked again after it ended): the strongest counts
    spots.set(booking.placementId, { id: booking.placementId, name: placement.name, base: known ? strongest([known.base, booking.base]) : booking.base });
  }
  return [...rows.values()]
    .map(({ spots, ...row }) => {
      const all = [...spots.values()];
      const open = all.filter((spot) => spot.base !== "ended");
      return { ...row, base: strongest(all.map((spot) => spot.base)), placements: (open.length ? open : all).sort((a, b) => a.name.localeCompare(b.name)) };
    })
    .sort((a, b) => creativeOrder.indexOf(a.creativeId) - creativeOrder.indexOf(b.creativeId) || shapeRank(a.shape) - shapeRank(b.shape));
}

/** "A", "A and B", "A, B and C". */
export function listWords(names) {
  const list = names.filter(Boolean);
  if (list.length < 2) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}
