// What a developer says about a game beyond the three lists advertisers aim at (genres, platforms, languages in
// lib/targeting.js): a one-line description, a store link, the devices it runs on and its play modes. These only
// describe the game, on its card and in its settings; no ad is aimed at them. The ids live here, not in the
// database, so the lists can grow without a migration (migration 0031 stores the chosen ids).

export const DESCRIPTION_MAX = 140;
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

export const cleanDescription = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX);

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
 * What the form sent, cleaned, shaped like the database columns: { description, store_url, devices, play_modes }.
 * Empty text is stored as null. Returns { value } or { error }.
 */
export function parseAbout(input) {
  const store = parseStoreUrl(input?.storeUrl);
  if (store.error) return { error: store.error };
  return {
    value: {
      description: cleanDescription(input?.description) || null,
      store_url: store.value || null,
      devices: cleanAboutList(input?.devices, "devices"),
      play_modes: cleanAboutList(input?.playModes, "play_modes"),
    },
  };
}

/** True when the game row has the columns of migration 0031. */
export const aboutKnown = (game) => game != null && Array.isArray(game.devices) && Array.isArray(game.play_modes);

/** "Quest 2, Pico 4" or "Quest 2, Pico 4 +3": the first `limit` names, then how many more. */
export function listText(options, ids, limit = 3) {
  const names = ids.map((id) => options.find((option) => option.id === id)?.label).filter(Boolean);
  return names.length > limit ? `${names.slice(0, limit).join(", ")} +${names.length - limit}` : names.join(", ");
}

// ------------------------------------------------------------------ how a game reads on its card

import { GENRES, PLATFORMS, LANGUAGES } from "./targeting.js";

const lookup = (options, id) => options.find((option) => option.id === id)?.label;

/**
 * What a game's card shows beyond its name: up to three genre tags with a "+N" for the rest, and one line each for
 * platforms, devices, languages and play modes (empty ones show a dash). `game` has the database column names
 * (genres, platforms, languages, devices, play_modes), missing ones counting as empty.
 */
export function cardSummary(game) {
  const genres = (game?.genres ?? []).map((id) => lookup(GENRES, id)).filter(Boolean);
  const platforms = (game?.platforms ?? []).map((id) => lookup(PLATFORMS, id)?.replace(/ \(.*\)$/, "")).filter(Boolean);
  return {
    tags: genres.slice(0, 3),
    more: Math.max(0, genres.length - 3),
    rows: [
      ["Platforms", platforms.length > 3 ? `${platforms.slice(0, 3).join(", ")} +${platforms.length - 3}` : platforms.join(", ")],
      ["Devices", listText(DEVICES, game?.devices ?? [])],
      ["Languages", listText(LANGUAGES, game?.languages ?? [])],
      ["Play modes", listText(PLAY_MODES, game?.play_modes ?? [])],
    ],
  };
}
