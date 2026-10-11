import { DEFAULT_CROP, visibleWindow } from "./surface-math.js";

// Ad formats and which picture a creative shows on a placement. Pure, shared by the
// manifest, the booking page and the creative's page (migration 0017 has the same list).

export const TOLERANCE = 0.15;
// A safe zone that overshoots the visible window by a hair still counts as fitting.
const SLACK = 0.02;

export const FORMATS = [
  { id: "r16x9", label: "16:9 landscape", aspect: 16 / 9 },
  { id: "r4x3", label: "4:3 landscape", aspect: 4 / 3 },
  { id: "r1x1", label: "1:1 square", aspect: 1 },
  { id: "r3x4", label: "3:4 portrait", aspect: 3 / 4 },
  { id: "r9x16", label: "9:16 tall", aspect: 9 / 16 },
  { id: "r2x1", label: "2:1 wide", aspect: 2 },
  { id: "r3x1", label: "3:1 banner", aspect: 3 },
];

export const DEFAULT_SAFE_ZONE = Object.freeze({ x: 0.15, y: 0.15, w: 0.7, h: 0.7 });

const valid = (value) => Number.isFinite(value) && value > 0;

/** Are two aspect ratios within the tolerance of each other? */
export function aspectClose(a, b, tolerance = TOLERANCE) {
  return valid(a) && valid(b) && Math.abs(a / b - 1) <= tolerance;
}

/** The standard format a placement belongs to (nearest within the tolerance), or null for a custom one. */
export function formatOf(aspect) {
  if (!valid(aspect)) return null;
  let best = null;
  let bestGap = Infinity;
  for (const format of FORMATS) {
    const gap = Math.abs(aspect / format.aspect - 1);
    if (gap <= TOLERANCE && gap < bestGap) {
      best = format;
      bestGap = gap;
    }
  }
  return best ? best.id : null;
}

export function formatLabel(id) {
  return FORMATS.find((format) => format.id === id)?.label ?? "Custom";
}

/** A safe zone from database columns or form values: clamped into the image, never empty. */
export function normalizeSafeZone(zone) {
  const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  let w = Math.min(1, Math.max(0.05, num(zone?.w ?? zone?.safe_w, DEFAULT_SAFE_ZONE.w)));
  let h = Math.min(1, Math.max(0.05, num(zone?.h ?? zone?.safe_h, DEFAULT_SAFE_ZONE.h)));
  const x = Math.min(1 - w, Math.max(0, num(zone?.x ?? zone?.safe_x, DEFAULT_SAFE_ZONE.x)));
  const y = Math.min(1 - h, Math.max(0, num(zone?.y ?? zone?.safe_y, DEFAULT_SAFE_ZONE.y)));
  return { x, y, w, h };
}

/**
 * Can the main image be cropped to this shape without cutting into the safe zone?
 * Returns { fits, crop }: the crop (zoom 1) that keeps the safe zone in view.
 */
export function cropKeepingSafeZone(imageAspect, surfaceAspect, safeZone) {
  if (!valid(imageAspect) || !valid(surfaceAspect)) return { fits: true, crop: { ...DEFAULT_CROP } };
  const zone = normalizeSafeZone(safeZone);
  const win = visibleWindow(imageAspect, surfaceAspect, 1);
  const fits = zone.w <= win.w + SLACK && zone.h <= win.h + SLACK;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const x = clamp(zone.x + zone.w / 2, win.w / 2, 1 - win.w / 2);
  const y = clamp(zone.y + zone.h / 2, win.h / 2, 1 - win.h / 2);
  return { fits, crop: { zoom: 1, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 } };
}

/**
 * Which picture a creative shows on a placement of the given shape.
 *   creative: { aspect (width / height of the main image), safeZone }
 *   assets:   [{ id, formatId (null = custom), aspect, status }] — only approved ones count
 * Returns { kind: "asset", asset, crop } | { kind: "crop", crop } | { kind: "none" }.
 * An unknown shape (the game did not report one) shows the main image as before.
 */
export function pickImage({ creative, assets = [], surfaceAspect }) {
  if (!valid(surfaceAspect)) return { kind: "crop", crop: { ...DEFAULT_CROP } };

  const approved = assets.filter((asset) => asset.status === "approved");
  const format = formatOf(surfaceAspect);

  const own =
    format !== null
      ? approved.find((asset) => asset.formatId === format)
      : approved.find((asset) => asset.formatId == null && aspectClose(asset.aspect, surfaceAspect));
  if (own) return { kind: "asset", asset: own, crop: { ...DEFAULT_CROP } };

  const { fits, crop } = cropKeepingSafeZone(creative?.aspect, surfaceAspect, creative?.safeZone);
  return fits ? { kind: "crop", crop } : { kind: "none" };
}

/** One row per standard format: how the creative would be shown there. For the creative's page. */
export function coverageByFormat({ creative, assets = [] }) {
  return FORMATS.map((format) => ({
    format,
    ...pickImage({ creative, assets, surfaceAspect: format.aspect }),
    pending: assets.some((asset) => asset.formatId === format.id && asset.status === "pending"),
  }));
}

/** Short words for the booking page and the placement lists. */
export function coverageWord(result) {
  if (result.kind === "asset") return "own image";
  if (result.kind === "crop") return "auto-crop";
  return "not covered";
}
