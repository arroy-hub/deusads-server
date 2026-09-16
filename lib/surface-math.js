// Shared by the server (page, manifest, actions) and the client card, so the
// framing maths and the ratio label are identical everywhere.

export function ratioLabel(aspect) {
  const known = [
    [16 / 9, "16:9"],
    [4 / 3, "4:3"],
    [1, "1:1"],
    [3 / 4, "3:4"],
    [9 / 16, "9:16"],
    [21 / 9, "21:9"],
  ];
  const match = known.find(([value]) => Math.abs(value - aspect) / aspect < 0.04);
  return match ? match[1] : `${aspect.toFixed(2)}:1`;
}

// ------------------------------------------------------------------ crop
// A crop refines the cover fit the SDK already does. It is three numbers:
//   zoom  1 = plain cover fit, 2 = twice as close
//   x, y  centre of the visible window in the image, 0..1 from the top-left
// The SDK (DeusAdPlacement.ComputeCoverScaleOffset) applies the same maths.

export const DEFAULT_CROP = Object.freeze({ zoom: 1, x: 0.5, y: 0.5 });
export const MAX_ZOOM = 4;

const round = (value) => Math.round(value * 10000) / 10000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A crop safe to store: finite, in range, 4 decimals. */
export function normalizeCrop(crop) {
  const zoom = Number(crop?.zoom);
  const x = Number(crop?.x);
  const y = Number(crop?.y);
  return {
    zoom: Number.isFinite(zoom) ? round(clamp(zoom, 1, 8)) : 1,
    x: Number.isFinite(x) ? round(clamp(x, 0, 1)) : 0.5,
    y: Number.isFinite(y) ? round(clamp(y, 0, 1)) : 0.5,
  };
}

export function cropFromRow(row) {
  return normalizeCrop({ zoom: row?.crop_zoom ?? 1, x: row?.crop_x ?? 0.5, y: row?.crop_y ?? 0.5 });
}

export function sameCrop(a, b) {
  const p = normalizeCrop(a);
  const q = normalizeCrop(b);
  return p.zoom === q.zoom && p.x === q.x && p.y === q.y;
}

/**
 * Fraction of the image width and height that shows through the surface.
 * Both are at most 1; the window centre can move only as far as the image reaches.
 */
export function visibleWindow(imageAspect, surfaceAspect, zoom) {
  let w = 1;
  let h = 1;
  if (imageAspect > surfaceAspect) w = surfaceAspect / imageAspect;
  else h = imageAspect / surfaceAspect;
  return { w: w / zoom, h: h / zoom };
}

/** Moves the window centre back inside the image. */
export function clampCrop(crop, imageAspect, surfaceAspect) {
  const c = normalizeCrop(crop);
  const win = visibleWindow(imageAspect, surfaceAspect, c.zoom);
  return {
    zoom: c.zoom,
    x: round(clamp(c.x, win.w / 2, 1 - win.w / 2)),
    y: round(clamp(c.y, win.h / 2, 1 - win.h / 2)),
  };
}

/**
 * Where to draw the whole image so the crop shows through the frame, in % of
 * the frame. Percentages keep the frame free to take any size in the layout.
 */
export function imagePlacement(imageAspect, surfaceAspect, crop) {
  const c = clampCrop(crop, imageAspect, surfaceAspect);
  const win = visibleWindow(imageAspect, surfaceAspect, c.zoom);
  const width = 100 / win.w;
  const height = 100 / win.h;
  return { width, height, left: 50 - c.x * width, top: 50 - c.y * height };
}

/** Share of the image that ends up outside the frame, 0..100. */
export function hiddenPercent(imageAspect, surfaceAspect, zoom = 1) {
  if (!(imageAspect > 0) || !(surfaceAspect > 0)) return 0;
  const win = visibleWindow(imageAspect, surfaceAspect, zoom);
  return Math.round((1 - win.w * win.h) * 100);
}
