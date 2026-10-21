// What a game says about itself beyond the three targeting lists (lib/game-about.js). Run: node test/game-about.test.mjs
import assert from "node:assert/strict";
import {
  ABOUT_KEYS,
  ABOUT_LISTS,
  DEVICES,
  PLAY_MODES,
  aboutKnown,
  cleanAboutList,
  genreTags,
  listText,
  previewRows,
  parseAbout,
  parseStoreUrl,
} from "../lib/game-about.js";

// --- the lists: unique ids, labels, under the caps migration 0031 enforces
for (const [name, options] of [["devices", DEVICES], ["play_modes", PLAY_MODES]]) {
  const ids = options.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, `${name}: ids are unique`);
  assert.ok(ids.every((id) => /^[a-z0-9]{2,12}$/.test(id)), `${name}: ids are short lowercase words`);
  assert.ok(options.every((option) => option.label.length > 0), `${name}: every id has a label`);
  assert.ok(ids.length <= ABOUT_LISTS[name].max, `${name}: fits under the cap`);
}
assert.deepEqual(ABOUT_KEYS, ["devices", "play_modes"]);

// --- cleaning
assert.deepEqual(cleanAboutList(["pico4", "nope", "quest2", "pico4"], "devices"), ["quest2", "pico4"], "known ids once, in list order");
assert.deepEqual(cleanAboutList(null, "play_modes"), []);

// --- the store link
assert.deepEqual(parseStoreUrl(""), { value: "" });
assert.equal(parseStoreUrl("https://www.meta.com/experiences/1").value, "https://www.meta.com/experiences/1");
assert.equal(parseStoreUrl("store.steampowered.com/app/10").value, "https://store.steampowered.com/app/10", "a missing scheme becomes https");
assert.ok(parseStoreUrl("javascript:alert(1)").error, "only web addresses");
assert.ok(parseStoreUrl("not a link").error);
assert.ok(parseStoreUrl("https://localhost").error, "needs a real host name");
assert.ok(parseStoreUrl(`https://a.com/${"x".repeat(400)}`).error, "too long");

// --- the whole form
const empty = parseAbout({});
assert.deepEqual(empty.value, { store_url: null, devices: [], play_modes: [] }, "nothing is required");
const full = parseAbout({ storeUrl: "meta.com/x", devices: ["quest3", "zzz"], playModes: ["solo", "coop"] });
assert.deepEqual(full.value, { store_url: "https://meta.com/x", devices: ["quest3"], play_modes: ["solo", "coop"] });
assert.ok(parseAbout({ storeUrl: "nope" }).error, "a bad link is an error, not silently dropped");

// --- old database rows
assert.equal(aboutKnown({ devices: [], play_modes: [] }), true);
assert.equal(aboutKnown({ name: "x" }), false, "no columns, migration 0031 not applied");
assert.equal(aboutKnown(null), false);

// --- what the card shows
assert.deepEqual(genreTags(["action", "puzzle", "racing", "casual", "rpg"]), { tags: ["Action", "Puzzle", "Racing"], more: 2 });
assert.deepEqual(genreTags(["action"]), { tags: ["Action"], more: 0 });
assert.deepEqual(genreTags([]), { tags: [], more: 0 });
assert.deepEqual(genreTags(undefined), { tags: [], more: 0 }, "an old row without genres");
assert.deepEqual(genreTags(["nope"]), { tags: [], more: 0 }, "unknown ids are skipped");

assert.equal(listText(DEVICES, ["quest2", "quest3", "questpro", "pico4"]), "Quest 2, Quest 3 / 3S, Quest Pro +1");
assert.equal(listText(DEVICES, []), "");
assert.deepEqual(
  previewRows({ platforms: ["quest", "pico"], devices: ["pico4"], languages: ["en"], countries: ["de", "us"], playModes: ["solo"] }),
  [["Platforms", "Meta Quest, Pico"], ["Devices", "Pico 4"], ["Languages", "English"], ["Countries", "Germany, United States"], ["Play modes", "Single-player"]],
  "the platform names lose their bracket"
);
assert.ok(previewRows({}).every(([, text]) => text === ""), "an empty form has empty lines");

console.log("game-about: ok");
