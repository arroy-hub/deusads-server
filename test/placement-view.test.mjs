// Grouping, filtering, sorting and state of placements in the dashboard (lib/placement-view.js).
// Run: node test/placement-view.test.mjs
import assert from "node:assert/strict";
import {
  cleanView, effectiveType, facets, filterItems, groupItems, offReason, sortItems, stateOf, summarize, typeIsSuggested, typeLabel, withView,
} from "../lib/placement-view.js";

const item = (id, extra = {}) => ({
  id, externalId: `plc_${id}`, label: id, shared: true, enabled: true, folderId: null, tags: [],
  placeType: null, suggestedType: null, aspect: 16 / 9, format: "16:9", places: [], hasAds: false, views: 0, ...extra,
});
const at = (scene, path = "x") => ({ id: `${scene}/${path}`, scene, path });

const ctx = { folders: [{ id: "f1", name: "Shops", enabled: true }, { id: "f2", name: "Old", enabled: false }, { id: "f3", name: "Empty", enabled: true }], offScenes: new Set(["Level_5"]) };

const items = [
  item("banner", { shared: true, places: [at("Level_3", "A"), at("Level_5", "B")], hasAds: true, views: 50, tags: ["wall", "hot"], suggestedType: "gameplay" }),
  item("logo", { shared: false, places: [at("MainMenu")], hasAds: true, views: 10, format: "1:1", placeType: "menu", folderId: "f1" }),
  item("poster", { places: [at("Level_5")], hasAds: true, views: 5, tags: ["wall"], folderId: "f2" }),
  item("blank", { places: [at("Level_3")], format: "9:16", views: 0 }),
  item("lost", { places: [], enabled: false, views: 2 }),
];

// --- state: off wins; a scene that is off covers only the copies in it
assert.equal(stateOf(items[0], ctx), "partly", "one copy in a scene that is off");
assert.equal(stateOf(items[1], ctx), "showing");
assert.equal(stateOf(items[2], ctx), "off", "its folder is off (and its only scene is off)");
assert.equal(stateOf(items[3], ctx), "empty");
assert.equal(stateOf(items[4], ctx), "off", "off by itself");
assert.equal(offReason(items[4], ctx), "Switched off");
assert.equal(offReason(items[2], ctx), 'Folder "Old" is off');
assert.equal(offReason(items[0], ctx), "Scene Level_5 off");
assert.equal(offReason(items[1], ctx), "");

// a folder switched on does not bring back a placement that is off itself
assert.equal(stateOf({ ...items[4], folderId: "f1" }, ctx), "off");

// --- place type: the developer's choice wins over the guess
assert.equal(effectiveType(items[0]), "gameplay");
assert.equal(typeIsSuggested(items[0]), true);
assert.equal(typeIsSuggested(items[1]), false);
assert.equal(effectiveType(items[3]), null);
assert.equal(typeLabel(null), "Not determined");
assert.equal(typeLabel("menu"), "Menu");
assert.equal(effectiveType({ ...items[0], placeType: "shop" }), "shop");

// --- grouping by scene: a shared placement stands in each of its scenes, once per group
let groups = groupItems(items, "scene", ctx);
assert.deepEqual(groups.map((g) => g.label), ["Level_3", "Level_5", "MainMenu", "(no scene)"]);
assert.deepEqual(groups[0].items.map((i) => i.id), ["banner", "blank"]);
assert.deepEqual(groups[1].items.map((i) => i.id), ["banner", "poster"]);
assert.equal(groups[0].sceneSwitch, true);
assert.equal(groups[3].sceneSwitch, false, "no switch for the nameless scene");
assert.equal(summarize(items, ctx).total, 5, "a placement is counted once however many scenes it stands in");
assert.equal(summarize(items, ctx).places, 6);

// --- other groupings
groups = groupItems(items, "folder", ctx);
assert.deepEqual(groups.map((g) => g.label), ["Empty", "Old", "Shops", "Not in a folder"], "empty folders are listed; 'not in a folder' last");
assert.equal(groups.find((g) => g.label === "Empty").items.length, 0);
assert.equal(groups.find((g) => g.label === "Old").enabled, false);
groups = groupItems(items, "tag", ctx);
assert.deepEqual(groups.map((g) => g.label), ["hot", "wall", "No tags"]);
assert.deepEqual(groups.find((g) => g.label === "wall").items.map((i) => i.id), ["banner", "poster"]);
groups = groupItems(items, "format", ctx);
assert.deepEqual(groups.map((g) => g.label).sort(), ["16:9", "1:1", "9:16"]);
groups = groupItems(items, "type", ctx);
assert.deepEqual(groups.map((g) => g.label), ["Gameplay", "Menu", "Not determined"]);
groups = groupItems(items, "status", ctx);
assert.deepEqual(groups.map((g) => g.key), ["showing", "empty", "partly", "off"]);

// --- filters
const ids = (list) => list.map((i) => i.id);
assert.deepEqual(ids(filterItems(items, { q: "menu" }, ctx)), ["logo"], "search finds scene and type words");
assert.deepEqual(ids(filterItems(items, { q: "plc_blank" }, ctx)), ["blank"], "search finds the ID");
assert.deepEqual(ids(filterItems(items, { q: "wall/" }, ctx)), [], "paths are searched too (no hierarchy path here)");
assert.deepEqual(ids(filterItems(items, { q: "hot" }, ctx)), ["banner"], "search finds tags");
assert.deepEqual(ids(filterItems(items, { format: "1:1" }, ctx)), ["logo"]);
assert.deepEqual(ids(filterItems(items, { status: "off" }, ctx)), ["banner", "poster", "lost"], "partly-off counts as off in this filter");
assert.deepEqual(ids(filterItems(items, { status: "empty" }, ctx)), ["blank"]);
assert.deepEqual(ids(filterItems(items, { type: "none" }, ctx)), ["poster", "blank", "lost"], "only placements without a type");
assert.deepEqual(ids(filterItems(items, { type: "menu" }, ctx)), ["logo"]);
assert.deepEqual(ids(filterItems(items, { folder: "none" }, ctx)), ["banner", "blank", "lost"]);
assert.deepEqual(ids(filterItems(items, { folder: "f1" }, ctx)), ["logo"]);
assert.deepEqual(ids(filterItems(items, { tag: "wall" }, ctx)), ["banner", "poster"]);
assert.deepEqual(ids(filterItems(items, { scene: "Level_3" }, ctx)), ["banner", "blank"]);
assert.deepEqual(ids(filterItems(items, { sharing: "unique" }, ctx)), ["logo"]);
assert.deepEqual(ids(filterItems(items, { sharing: "shared", scene: "Level_5" }, ctx)), ["banner", "poster"], "filters combine");
assert.equal(filterItems(items, {}, ctx).length, 5);

// --- sorting
assert.deepEqual(ids(sortItems(items, "name")), ["banner", "blank", "logo", "lost", "poster"]);
assert.deepEqual(ids(sortItems(items, "views")), ["banner", "logo", "poster", "lost", "blank"]);
assert.deepEqual(ids(sortItems([item("p10"), item("p2"), item("p1")], "name")), ["p1", "p2", "p10"], "numbers sort as numbers");
assert.deepEqual(ids(sortItems(items, "newest")).length, 5);

// --- facets
const f = facets(items, ctx);
assert.deepEqual(f.formats, ["1:1", "9:16", "16:9"]);
assert.deepEqual(f.scenes, ["Level_3", "Level_5", "MainMenu"]);
assert.deepEqual(f.tags, ["hot", "wall"]);
assert.equal(f.hasUndetermined, true);

// --- saved views
assert.equal(cleanView({ name: "  " }), null);
assert.deepEqual(cleanView({ name: "Empty ones", groupBy: "nonsense", sortBy: "x", filters: { status: "empty", bogus: "y", q: 5 } }), {
  name: "Empty ones", groupBy: "folder", sortBy: "manual", filters: { status: "empty" },
});
let views = withView([], { name: "A", groupBy: "tag" });
views = withView(views, { name: "B" });
views = withView(views, { name: "a", groupBy: "format" });
assert.deepEqual(views.map((v) => [v.name, v.groupBy]), [["B", "folder"], ["a", "format"]], "same name replaces, case-insensitive");
let many = [];
for (let i = 0; i < 30; i += 1) many = withView(many, { name: `v${i}` });
assert.equal(many.length, 20, "at most 20 saved views");

{
  const a = { id: "a", label: "Alpha", sortIndex: 2 }, b = { id: "b", label: "Beta", sortIndex: 0 }, c = { id: "c", label: "Cargo" }, d = { id: "d", label: "Delta", sortIndex: 1 }, e = { id: "e", label: "Apex" };
  assert.deepEqual(sortItems([a, b, c, d, e], "manual").map((x) => x.id), ["b", "d", "a", "e", "c"], "own order first, unordered ones after by name");
  assert.deepEqual(sortItems([c, e], "manual").map((x) => x.id), ["e", "c"], "without any order: by name");
}
console.log("placement view: all checks passed");
