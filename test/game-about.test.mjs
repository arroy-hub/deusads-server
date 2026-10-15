// What a game says about itself beyond the three targeting lists (lib/game-about.js). Run: node test/game-about.test.mjs
import assert from "node:assert/strict";
import {
  ABOUT_KEYS,
  ABOUT_LISTS,
  DESCRIPTION_MAX,
  DEVICES,
  PLAY_MODES,
  aboutKnown,
  cardSummary,
  cleanAboutList,
  cleanDescription,
  listText,
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
assert.equal(cleanDescription("  A  fishing\n game  "), "A fishing game", "spaces and line breaks collapse");
assert.equal(cleanDescription("x".repeat(500)).length, DESCRIPTION_MAX);
assert.equal(cleanDescription(null), "");

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
assert.deepEqual(empty.value, { description: null, store_url: null, devices: [], play_modes: [] }, "nothing is required");
const full = parseAbout({ description: " Cast a line. ", storeUrl: "meta.com/x", devices: ["quest3", "zzz"], playModes: ["solo", "coop"] });
assert.deepEqual(full.value, { description: "Cast a line.", store_url: "https://meta.com/x", devices: ["quest3"], play_modes: ["solo", "coop"] });
assert.ok(parseAbout({ storeUrl: "nope" }).error, "a bad link is an error, not silently dropped");

// --- old database rows
assert.equal(aboutKnown({ devices: [], play_modes: [] }), true);
assert.equal(aboutKnown({ name: "x" }), false, "no columns, migration 0031 not applied");
assert.equal(aboutKnown(null), false);

// --- what the card shows
assert.equal(listText(DEVICES, ["quest2", "quest3", "questpro", "pico4"]), "Quest 2, Quest 3 / 3S, Quest Pro +1");
assert.equal(listText(DEVICES, []), "");
const card = cardSummary({
  genres: ["action", "puzzle", "racing", "casual", "rpg"],
  platforms: ["quest", "pico"],
  languages: ["en"],
  devices: ["pico4"],
  play_modes: ["solo"],
});
assert.deepEqual(card.tags, ["Action", "Puzzle", "Racing"]);
assert.equal(card.more, 2);
assert.deepEqual(card.rows, [["Platforms", "Meta Quest, Pico"], ["Devices", "Pico 4"], ["Languages", "English"], ["Play modes", "Single-player"]]);
const bare = cardSummary({});
assert.deepEqual(bare.tags, []);
assert.ok(bare.rows.every(([, text]) => text === ""), "an empty game has empty lines");

console.log("game-about: ok");
