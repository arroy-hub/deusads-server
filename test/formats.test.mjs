import assert from "node:assert/strict";
import { FORMATS, formatOf, aspectClose, cropKeepingSafeZone, pickImage, coverageByFormat, normalizeSafeZone } from "../lib/formats.js";

// formats from aspect ratios
assert.equal(formatOf(16 / 9), "r16x9");
assert.equal(formatOf(1.7), "r16x9");
assert.equal(formatOf(1), "r1x1");
assert.equal(formatOf(0.56), "r9x16");
assert.equal(formatOf(3.1), "r3x1");
assert.equal(formatOf(2.05), "r2x1");
assert.equal(formatOf(2.4), null, "between 2:1 and 3:1, more than 15% from both: custom");
assert.equal(formatOf(5), null);
assert.equal(formatOf(null), null);
assert.equal(formatOf(0), null);
// the nearest wins where two overlap (16:9 and 2:1 are 12.5% apart)
assert.equal(formatOf(1.9), "r2x1");
assert.equal(formatOf(1.8), "r16x9");
assert.ok(aspectClose(1.5, 1.6) && !aspectClose(1, 1.3));

// safe zone: a 16:9 image
const wide = 16 / 9;
const centre = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
assert.equal(cropKeepingSafeZone(wide, 16 / 9, centre).fits, true);
assert.equal(cropKeepingSafeZone(wide, 1, centre).fits, false, "a square window shows 56% of the width: the 70% zone is cut");
const narrow = { x: 0.4, y: 0.2, w: 0.3, h: 0.6 };
const sq = cropKeepingSafeZone(wide, 1, narrow);
assert.equal(sq.fits, true);
assert.equal(sq.crop.x, 0.55, "the window is centred on the safe zone");
assert.equal(cropKeepingSafeZone(wide, 9 / 16, narrow).fits, true);
assert.equal(cropKeepingSafeZone(wide, 9 / 16, { x: 0.3, y: 0.2, w: 0.5, h: 0.6 }).fits, false);
// near the edge the window stays inside the image and still holds the zone
const edge = cropKeepingSafeZone(wide, 1, { x: 0, y: 0.2, w: 0.25, h: 0.5 });
assert.equal(edge.fits, true);
assert.ok(edge.crop.x - 0.5625 / 2 >= -1e-9, "window does not leave the image");
// unknown shapes never throw
assert.equal(cropKeepingSafeZone(null, 1, centre).fits, true);
assert.equal(cropKeepingSafeZone(wide, undefined, centre).fits, true);

// normalizeSafeZone keeps the zone inside the image
assert.deepEqual(normalizeSafeZone({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
assert.deepEqual(normalizeSafeZone(undefined), { x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
assert.equal(normalizeSafeZone({ w: 0, h: 0 }).w, 0.05);
assert.equal(normalizeSafeZone({ safe_x: "0.2", safe_y: "0.1", safe_w: "0.5", safe_h: "0.5" }).x, 0.2, "database columns work too");

// pickImage: own image > auto-crop > none
const creative = { aspect: wide, safeZone: centre };
const asset = (id, formatId, aspect, status = "approved") => ({ id, formatId, aspect, status });
const square = asset("sq", "r1x1", 1);
assert.equal(pickImage({ creative, assets: [square], surfaceAspect: 1 }).asset.id, "sq");
assert.equal(pickImage({ creative, assets: [square], surfaceAspect: 1.05 }).asset.id, "sq", "a 1.05 placement is a 1:1 placement");
assert.equal(pickImage({ creative, assets: [asset("sq", "r1x1", 1, "pending")], surfaceAspect: 1 }).kind, "none", "a pending image is not used");
assert.equal(pickImage({ creative, assets: [], surfaceAspect: 16 / 9 }).kind, "crop");
assert.equal(pickImage({ creative, assets: [], surfaceAspect: 1.7 }).kind, "crop");
assert.equal(pickImage({ creative, assets: [], surfaceAspect: 0.56 }).kind, "none");
// custom placements: a custom image within 15% of the shape
const custom = asset("c1", null, 2.6);
assert.equal(pickImage({ creative, assets: [custom], surfaceAspect: 2.5 }).asset.id, "c1");
assert.notEqual(pickImage({ creative, assets: [custom], surfaceAspect: 4.5 }).kind, "asset");
// custom images are not used on standard placements
assert.notEqual(pickImage({ creative, assets: [asset("c2", null, 1)], surfaceAspect: 1 }).kind, "asset");
// unknown placement shape: main image, as before
assert.equal(pickImage({ creative, assets: [], surfaceAspect: null }).kind, "crop");
assert.equal(pickImage({ creative, surfaceAspect: undefined }).kind, "crop");

// the matrix has one row per format
const matrix = coverageByFormat({ creative, assets: [square, asset("t", "r3x1", 3, "pending")] });
assert.equal(matrix.length, FORMATS.length);
assert.equal(matrix.find((row) => row.format.id === "r1x1").kind, "asset");
assert.equal(matrix.find((row) => row.format.id === "r16x9").kind, "crop");
assert.equal(matrix.find((row) => row.format.id === "r3x1").kind, "none");
assert.equal(matrix.find((row) => row.format.id === "r3x1").pending, true);

console.log("formats: all checks passed");

// --- the manifest's choice (lib/manifest-pick.js)
const { choosePictures } = await import("../lib/manifest-pick.js");
const rowFor = (id, source, aspect, extra = {}) => ({
  placementId: "p",
  source,
  advertiserId: id,
  creativeId: id,
  row: {
    placements: { external_id: "p", aspect_ratio: aspect },
    creatives: { id, storage_path: `${id}-main.png`, width_px: 1600, height_px: 900, safe_x: 0.15, safe_y: 0.15, safe_w: 0.7, safe_h: 0.7, ...extra },
  },
});
const url = (path) => `https://cdn/${path}`;
const assetMap = new Map([["B", [{ id: "a1", formatId: "r1x1", aspect: 1, status: "approved", storagePath: "B-square.png" }]]]);
const onSquare = choosePictures(
  [rowFor("own", "own", 1, { width_px: null }), rowFor("A", "booking", 1), rowFor("B", "booking", 1)],
  assetMap,
  url
);
assert.deepEqual(onSquare.servable.map((item) => item.creativeId), ["own", "B"], "A has no square picture and its safe zone does not fit: dropped");
assert.equal(onSquare.shown.get(onSquare.servable[1].row).imageUrl, "https://cdn/B-square.png");
assert.equal(onSquare.shown.get(onSquare.servable[0].row).imageUrl, "https://cdn/own-main.png", "the developer's own creative is always served");
const onWide = choosePictures([rowFor("A", "booking", 16 / 9)], new Map(), url);
assert.equal(onWide.servable.length, 1);
assert.equal(onWide.shown.get(onWide.servable[0].row).imageUrl, "https://cdn/A-main.png");
// a booked creative whose size is unknown is served as before
assert.equal(choosePictures([rowFor("A", "booking", 1, { width_px: null })], new Map(), url).servable.length, 1);
// nothing servable on a placement -> the rotation gets no rows, the fallback shows
assert.equal(choosePictures([rowFor("A", "booking", 0.56)], new Map(), url).servable.length, 0);
console.log("manifest pick: all checks passed");
