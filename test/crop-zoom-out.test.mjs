import assert from "node:assert/strict";
import { MIN_ZOOM, clampCrop, hiddenPercent, imagePlacement, normalizeCrop, visibleWindow } from "../lib/surface-math.js";

assert.equal(MIN_ZOOM, 0.5);
assert.equal(normalizeCrop({ zoom: 0.5, x: 0.5, y: 0.5 }).zoom, 0.5);
assert.equal(normalizeCrop({ zoom: 0.2 }).zoom, 0.5);
assert.equal(normalizeCrop({ zoom: 1 }).zoom, 1);

// 16:9 picture in a 1:1 frame, pulled back to 0.5: the window is larger than the picture on both axes
const win = visibleWindow(16 / 9, 1, 0.5);
assert.ok(win.w > 1 && win.h > 1);

// the whole picture stays inside the frame: the centre can move only within the slack, and 0.5 stays valid
const moved = clampCrop({ zoom: 0.5, x: 0, y: 1 }, 16 / 9, 1);
assert.ok(moved.x >= 1 - win.w / 2 && moved.x <= win.w / 2);
assert.ok(moved.y >= 1 - win.h / 2 && moved.y <= win.h / 2);

// centred pulled-back picture is drawn smaller than the frame, with equal margins
const place = imagePlacement(1, 1, { zoom: 0.5, x: 0.5, y: 0.5 });
assert.equal(place.width, 50);
assert.equal(place.left, 25);

// zoom at or above 1 behaves exactly as before
const same = clampCrop({ zoom: 2, x: 0, y: 1 }, 16 / 9, 1);
const w2 = visibleWindow(16 / 9, 1, 2);
assert.equal(same.zoom, 2);
assert.ok(Math.abs(same.x - w2.w / 2) < 1e-4);
assert.ok(Math.abs(same.y - (1 - w2.h / 2)) < 1e-4);

assert.equal(hiddenPercent(16 / 9, 1, 0.5), 0, "nothing is cut when pulled back");
console.log("crop zoom-out ok");
