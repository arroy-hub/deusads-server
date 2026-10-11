// Rules for organising placements (lib/placement-organization.js).
// Run: node test/placement-organization.test.mjs
import assert from "node:assert/strict";
import { placesOf, suggestPlaceType, switchedOff } from "../lib/placement-organization.js";

// --- place type suggestion
assert.equal(suggestPlaceType("MainMenu", ""), "menu");
assert.equal(suggestPlaceType("Level_3", "Canvas/Wall"), "gameplay");
assert.equal(suggestPlaceType("Shop", ""), "shop");
assert.equal(suggestPlaceType("Scene_07", "Root/Banner"), null, "no guess, not a wrong one");
assert.equal(suggestPlaceType("", ""), null);
assert.equal(suggestPlaceType(undefined, undefined), null);
assert.equal(suggestPlaceType("LoadingScreen", ""), "loading");
assert.equal(suggestPlaceType("Gameplay", "UI/HUD/Top"), "hud", "the path can say more than the scene");

// --- places an SDK item reports
assert.deepEqual(placesOf({ places: [{ scene: "A", path: "x" }, { scene: "A", path: "x" }, { scene: "B", path: "y" }] }), [
  { scene: "A", path: "x" },
  { scene: "B", path: "y" },
], "copies reported twice count once");
assert.deepEqual(placesOf({ scene: "Old" }), [{ scene: "Old", path: "" }], "an old SDK sends one scene");
assert.deepEqual(placesOf({}), []);
assert.deepEqual(placesOf({ places: [{ scene: 5, path: null }] }), [{ scene: "", path: "" }], "garbage becomes empty text");
assert.equal(placesOf({ places: [{ scene: "s".repeat(500), path: "p".repeat(900) }] })[0].scene.length, 200);
assert.equal(placesOf({ places: [{ scene: "s".repeat(500), path: "p".repeat(900) }] })[0].path.length, 400);

// --- what is switched off ("off wins")
const placements = [
  { external_id: "a", enabled: true, folder_id: null },
  { external_id: "b", enabled: false, folder_id: null },
  { external_id: "c", enabled: true, folder_id: "f1" },
  { external_id: "d", enabled: true, folder_id: "f2" },
  { external_id: "e", enabled: false, folder_id: "f2", removed_at: "2026-10-01T00:00:00Z" },
];
const folders = [
  { id: "f1", enabled: false },
  { id: "f2", enabled: true },
];
assert.deepEqual(switchedOff({ placements, folders, offScenes: [] }), { disabled: ["b", "c"], disabledScenes: [] });

// a folder switched back on does not bring back a placement that is off itself
folders[0].enabled = true;
assert.deepEqual(switchedOff({ placements, folders, offScenes: [] }).disabled, ["b"]);

// scenes are named, not turned into ids: a placement added to the scene later is covered too
assert.deepEqual(switchedOff({ placements: [], folders: [], offScenes: [{ scene: "Level_3" }, { scene: "Level_3" }, { scene: "Arena" }] }), {
  disabled: [],
  disabledScenes: ["Arena", "Level_3"],
});

// nested folders (not in the dashboard yet): a parent that is off covers its children
assert.deepEqual(
  switchedOff({
    placements: [{ external_id: "n", enabled: true, folder_id: "child" }],
    folders: [{ id: "parent", enabled: false }, { id: "child", enabled: true, parent_id: "parent" }],
  }).disabled,
  ["n"]
);

// a folder that points at itself must not hang the check
assert.deepEqual(
  switchedOff({
    placements: [{ external_id: "loop", enabled: true, folder_id: "x" }],
    folders: [{ id: "x", enabled: true, parent_id: "x" }],
  }).disabled,
  []
);

assert.deepEqual(switchedOff({}), { disabled: [], disabledScenes: [] });

console.log("placement organization: all checks passed");
