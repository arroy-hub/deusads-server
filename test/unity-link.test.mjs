// Addresses between the dashboard and the Unity editor (lib/unity-link.js).
// Run: node test/unity-link.test.mjs
import assert from "node:assert/strict";
import { UNITY_LINK_PORT, addressOf, dashboardLink, locateUrl } from "../lib/unity-link.js";

assert.equal(UNITY_LINK_PORT, 47321);
assert.equal(locateUrl("plc_1", { scene: "Level 3", path: "Wall/Banner A" }), "http://127.0.0.1:47321/locate?id=plc_1&scene=Level+3&path=Wall%2FBanner+A");
assert.equal(locateUrl("plc_1"), "http://127.0.0.1:47321/locate?id=plc_1");
assert.equal(addressOf({ scene: "Level_3", path: "Wall/A" }), "Level_3 › Wall/A");
assert.equal(addressOf({ scene: "Level_3", path: "" }), "Level_3");
assert.equal(addressOf({ scene: "", path: "" }), "(no scene)");
assert.equal(dashboardLink("https://deusads-server.vercel.app/", "plc 1&x"), "https://deusads-server.vercel.app/dashboard/find?placement=plc%201%26x");
console.log("unity link: all checks passed");
