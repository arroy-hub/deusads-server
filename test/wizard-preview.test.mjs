import assert from "node:assert/strict";
import { completionOptions, creativeMark, creativeToComplete, previewCover, shapesCovered } from "../lib/wizard-preview.js";

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

// ---- the mark over a picture: which of the creatives it belongs to
const three = [night, shipping, { ...shipping, id: "third" }];
assert.deepEqual(creativeMark(three, "ship"), { number: 2, total: 3, text: "2/3" });
assert.equal(creativeMark(three, "third").text, "3/3");
assert.equal(creativeMark([night], "night"), null, "a single creative needs no mark");
assert.equal(creativeMark(three, "gone"), null, "an unknown creative has none");
// every tile that shows a picture can be marked with the creative that shows it
for (const r of previewCover([night, shipping])) {
  if (r.kind === "none") assert.equal(r.by, null);
  else assert.ok(creativeMark([night, shipping], r.by), `${r.format.id}: marked`);
}

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

console.log("wizard-preview tests passed");
