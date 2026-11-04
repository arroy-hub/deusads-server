import assert from "node:assert/strict";
import { addableCreatives, completionOptions, creativeToComplete, previewCover, shapesCovered, showing, stepShowing } from "../lib/wizard-preview.js";

// the case from the wizard: a tall sample with one picture of its own for 3:1, and a 16:9 picture
const night = {
  id: "night", url: "https://x/night-sample.png", width: 1080, height: 1920, safe: null,
  assets: [{ formatId: "r3x1", aspect: 680 / 241, status: "approved", url: "https://x/my-banner.png" }],
};
const shipping = { id: "ship", url: "https://x/shipping.png", width: 1920, height: 1080, safe: null, assets: [] };

const cover = previewCover([night, shipping]);
const row = (id) => cover.find((r) => r.format.id === id);
assert.equal(cover.length, 7);
assert.equal(row("r3x1").kind, "asset", "the own 3:1 picture covers 3:1");
assert.equal(row("r3x1").url, "https://x/my-banner.png", "and the tile shows that picture, not the sample of the creative");
assert.equal(row("r3x1").by, "night");
for (const r of cover) {
  if (r.format.id !== "r3x1" && r.kind !== "none") assert.notEqual(r.url, "https://x/my-banner.png", `${r.format.id}: only 3:1 shows the own picture`);
  if (r.kind === "crop") assert.ok(r.url === night.url || r.url === shipping.url, `${r.format.id}: a crop shows the main image of the creative that covers it`);
}
assert.equal(row("r16x9").by, "ship", "16:9 is covered by the 16:9 creative");

// an own picture wins over an automatic crop of another creative, whatever the order
const reversed = previewCover([shipping, night]);
assert.equal(reversed.find((r) => r.format.id === "r3x1").url, "https://x/my-banner.png");
assert.equal(reversed.find((r) => r.format.id === "r3x1").by, "night");

// a pending or rejected picture does not count
const pending = { ...night, assets: [{ ...night.assets[0], status: "pending" }] };
assert.notEqual(previewCover([pending]).find((r) => r.format.id === "r3x1").kind, "asset");

// no creatives: nothing is covered
assert.ok(previewCover([]).every((r) => r.kind === "none" && r.by === null));
// an own picture without an address falls back to the main image
const noUrl = { ...night, assets: [{ ...night.assets[0], url: "" }] };
assert.equal(previewCover([noUrl]).find((r) => r.format.id === "r3x1").url, night.url);

// a missing shape is added to the creative that covers the most shapes by itself
const bare = { ...night, assets: [] };
assert.ok(shapesCovered(shipping) > shapesCovered(bare), "the 16:9 picture covers more shapes than the bare tall sample");
assert.equal(creativeToComplete([bare, shipping]).id, "ship", "so a missing shape is added there, not to the first picked");
assert.equal(shapesCovered(night), shapesCovered(shipping), "with its own 3:1 picture the tall sample covers as many");
assert.equal(creativeToComplete([night, shipping]).id, "night", "and on a tie the first picked stays");
assert.equal(creativeToComplete([night]).id, "night");
assert.equal(creativeToComplete([]), null);
assert.equal(creativeToComplete([shipping, { ...shipping, id: "other" }]).id, "ship", "equal: the first");

// ---- paging through the creatives of a tile
const three = [night, shipping, { ...shipping, id: "third" }];
const pageCover = previewCover(three);
for (const r of pageCover) {
  if (r.kind === "none") { assert.deepEqual(r.shows, []); assert.equal(showing(r), null); assert.equal(stepShowing(r, null, 1), null); continue; }
  assert.equal(showing(r).by, r.by, `${r.format.id}: the default is what the tile shows first`);
  assert.equal(showing(r).total, r.shows.length);
  assert.ok(r.shows.every((s) => s.kind !== "none" && three.some((c) => c.id === s.id)), `${r.format.id}: only creatives that cover the shape`);
  // going round: after `total` steps forward (or back) we are where we started, having seen each creative once
  for (const direction of [1, -1]) {
    let id = r.by;
    const seen = new Set();
    for (let i = 0; i < r.shows.length; i++) { seen.add(id); id = stepShowing(r, id, direction); }
    assert.equal(id, r.by, `${r.format.id}: a full round comes back`);
    assert.equal(seen.size, r.shows.length, `${r.format.id}: every creative once`);
  }
}
const wide = pageCover.find((r) => r.format.id === "r16x9");
assert.deepEqual(wide.shows.map((s) => s.id), ["ship", "third"], "16:9 is covered by the two 16:9 creatives, in the order picked");
assert.equal(stepShowing(wide, "ship", 1), "third");
assert.equal(stepShowing(wide, "third", 1), "ship", "round the end");
assert.equal(stepShowing(wide, "ship", -1), "third", "and back round the start");
assert.equal(showing(wide, "third").position, 2);
assert.equal(showing(wide, "gone").by, wide.by, "an unknown creative: the default");
const banner = pageCover.find((r) => r.format.id === "r3x1");
assert.equal(banner.shows[0].id, "night", "the own 3:1 picture comes with its creative");
assert.equal(banner.shows[0].url, "https://x/my-banner.png");
assert.equal(banner.by, "night", "and is shown first, before an automatic crop");
// a shape only one creative covers cannot be paged
const only = previewCover([night]).find((r) => r.format.id === "r3x1");
assert.equal(only.shows.length, 1);
assert.equal(stepShowing(only, "night", 1), "night");
assert.equal(showing(only).total, 1);

// ---- the menu of a shape without a picture: the creatives it can be added to, the fullest first
const bare2 = { ...night, assets: [] };
const options = completionOptions([bare2, shipping]);
assert.deepEqual(options.map((o) => o.id), ["ship", "night"], "the creative that covers most shapes comes first");
assert.deepEqual(options.map((o) => o.number), [2, 1], "and keeps the number it has among the picked");
assert.equal(options[0].total, 7);
assert.equal(options[0].covered, shapesCovered(shipping));
assert.deepEqual(completionOptions([night, shipping]).map((o) => o.id), ["night", "ship"], "equal: in the order picked");
assert.deepEqual(completionOptions([night]).map((o) => o.id), ["night"], "one creative: one option");
assert.deepEqual(completionOptions([]), []);

// ---- adding a creative from the review step: the library without the picked and the rejected ones
const library = [{ id: "a", status: "approved" }, { id: "b", status: "pending" }, { id: "c", status: "rejected" }, { id: "d", status: "approved" }];
assert.deepEqual(addableCreatives(library, ["a"]).map((c) => c.id), ["b", "d"], "not picked, not rejected, library order");
assert.deepEqual(addableCreatives(library, []).map((c) => c.id), ["a", "b", "d"]);
assert.deepEqual(addableCreatives(library, ["a", "b", "d"]), [], "everything picked: nothing to add");
assert.deepEqual(addableCreatives(null, null), []);

console.log("wizard-preview tests passed");
