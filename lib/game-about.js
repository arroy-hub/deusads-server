// What a developer says about a game beyond the three lists advertisers aim at (genres, platforms, languages in
// lib/targeting.js): a store link, the devices it runs on and its play modes. These only
// describe the game in its settings; no ad is aimed at them and its card on My games does not show them. The ids live here, not in the
// database, so the lists can grow without a migration (migration 0031 stores the chosen ids).

export const STORE_URL_MAX = 300;

export const DEVICES = [
  { id: "quest2", label: "Quest 2" },
  { id: "quest3", label: "Quest 3 / 3S" },
  { id: "questpro", label: "Quest Pro" },
  { id: "pico4", label: "Pico 4" },
  { id: "index", label: "Valve Index" },
  { id: "vive", label: "HTC Vive" },
  { id: "psvr2", label: "PlayStation VR2" },
  { id: "avp", label: "Apple Vision Pro" },
  { id: "phone", label: "Phones" },
  { id: "tablet", label: "Tablets" },
];

export const PLAY_MODES = [
  { id: "solo", label: "Single-player" },
  { id: "online", label: "Online multiplayer" },
  { id: "coop", label: "Co-op" },
  { id: "local", label: "Local multiplayer" },
];

/** The two optional lists. `max` is the sanity cap migration 0031 also enforces. */
export const ABOUT_LISTS = {
  devices: { label: "Devices", noun: "device", plural: "devices", options: DEVICES, max: 32 },
  play_modes: { label: "Play modes", noun: "play mode", plural: "play modes", options: PLAY_MODES, max: 16 },
};
export const ABOUT_KEYS = Object.keys(ABOUT_LISTS);

/** Known ids only, once each, in the order of the official list. */
export function cleanAboutList(value, key) {
  const given = new Set((Array.isArray(value) ? value : []).map(String));
  const definition = ABOUT_LISTS[key];
  return definition.options
    .map((option) => option.id)
    .filter((id) => given.has(id))
    .slice(0, definition.max);
}

/** An http(s) address, or "" when empty. Returns { value } or { error }. */
export function parseStoreUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return { value: "" };
  if (text.length > STORE_URL_MAX) return { error: "The store link is too long." };
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: "The store link is not a web address." };
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    return { error: "The store link is not a web address." };
  }
  return { value: url.toString() };
}

/**
 * What the form sent, cleaned, shaped like the database columns: { store_url, devices, play_modes }.
 * Empty text is stored as null. Returns { value } or { error }.
 */
export function parseAbout(input) {
  const store = parseStoreUrl(input?.storeUrl);
  if (store.error) return { error: store.error };
  return {
    value: {
      store_url: store.value || null,
      devices: cleanAboutList(input?.devices, "devices"),
      play_modes: cleanAboutList(input?.playModes, "play_modes"),
    },
  };
}

/** True when the game row has the columns of migration 0031. */
export const aboutKnown = (game) => game != null && Array.isArray(game.devices) && Array.isArray(game.play_modes);

// ------------------------------------------------------------------ the preview card in the Add game pop-up
// (the cards on My games show only the name, connection and counts)

import { GENRES, PLATFORMS, LANGUAGES, COUNTRIES } from "./targeting.js";

/** The genre tags on the preview card: the first three names and how many more there are. `genres` is a list of ids. */
export function genreTags(genres) {
  const names = (genres ?? []).map((id) => GENRES.find((option) => option.id === id)?.label).filter(Boolean);
  return { tags: names.slice(0, 3), more: Math.max(0, names.length - 3) };
}

/** "Quest 2, Pico 4" or "Quest 2, Pico 4, Index +3": the first `limit` names, then how many more. */
export function listText(options, ids, limit = 3) {
  const names = (ids ?? []).map((id) => options.find((option) => option.id === id)?.label).filter(Boolean);
  return names.length > limit ? `${names.slice(0, limit).join(", ")} +${names.length - limit}` : names.join(", ");
}

/** The lines under the genre tags on the preview card: [label, text] for platforms, devices, languages, countries and play modes ("" when empty). */
export function previewRows({ platforms, devices, languages, countries, playModes }) {
  const platformOptions = PLATFORMS.map((option) => ({ ...option, label: option.label.replace(/ \(.*\)$/, "") }));
  return [
    ["Platforms", listText(platformOptions, platforms)],
    ["Devices", listText(DEVICES, devices)],
    ["Languages", listText(LANGUAGES, languages)],
    ["Countries", listText(COUNTRIES, countries)],
    ["Play modes", listText(PLAY_MODES, playModes)],
  ];
}
