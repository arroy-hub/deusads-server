import assert from "node:assert/strict";
import { campaignCoverCss, coverSeed } from "../lib/campaign-cover.js";
import { COVERS } from "../lib/game-cover.js";

const urlOf = (path) => `https://files/${path}`;
assert.equal(coverSeed("ab"), 97 + 98);
// nothing chosen: the first creative's picture, else a colour by id
assert.match(campaignCoverCss({ id: "x", firstUrl: "https://c/1.png" }), /url\("https:\/\/c\/1\.png"\)/);
assert.equal(campaignCoverCss({ id: "x" }), campaignCoverCss({ id: "x", value: null }));
assert.ok(COVERS.some((c) => c.css === campaignCoverCss({ id: "x" })));
// a chosen colour wins over the creative
const preset = COVERS[1];
assert.equal(campaignCoverCss({ id: "x", value: `preset:${preset.id}`, firstUrl: "https://c/1.png" }), preset.css);
// an uploaded picture wins too
assert.match(campaignCoverCss({ id: "x", value: "image:u/a.jpg", firstUrl: "https://c/1.png", urlOf }), /https:\/\/files\/u\/a\.jpg/);
// an uploaded picture that cannot be resolved falls back to a colour, not to nothing
assert.ok(COVERS.some((c) => c.css === campaignCoverCss({ id: "x", value: "image:u/a.jpg" })));
// junk is treated as nothing chosen
assert.match(campaignCoverCss({ id: "x", value: "preset:nope", firstUrl: "https://c/1.png" }), /c\/1\.png/);
console.log("campaign-cover ok");
