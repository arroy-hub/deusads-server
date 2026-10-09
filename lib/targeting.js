// Targeting: what a game says about itself, what an advertiser asks for, and whether the two fit.
// Pure, shared by the manifest, the dashboards and the tests. The lists below live in code, not in
// the database, so they can grow without a migration: migration 0018 only stores the chosen ids.
//
// Rules (they are what the manifest and the booking page both apply):
//   - inside one field the match is "any of": the game has at least one of the wanted values;
//   - between fields it is "all": genre, platform and language must each fit;
//   - exclude_genres: the game must have none of those genres;
//   - strict: a field the creative restricts but the game has not filled in does not fit;
//   - a creative without targeting (null) fits every game, and the developer's own creative in
//     their own game is never filtered (it is the fallback).

export const GENRES = [
  { id: "action", label: "Action" },
  { id: "shooter", label: "Shooter" },
  { id: "adventure", label: "Adventure" },
  { id: "puzzle", label: "Puzzle" },
  { id: "racing", label: "Racing" },
  { id: "simulation", label: "Simulation" },
  { id: "sports", label: "Sports" },
  { id: "rhythm", label: "Rhythm and music" },
  { id: "horror", label: "Horror" },
  { id: "strategy", label: "Strategy" },
  { id: "rpg", label: "RPG" },
  { id: "casual", label: "Casual" },
  { id: "social", label: "Social and multiplayer" },
];

export const PLATFORMS = [
  { id: "quest", label: "Meta Quest (2, 3, Pro)" },
  { id: "pico", label: "Pico" },
  { id: "steamvr", label: "SteamVR / PC VR" },
  { id: "psvr2", label: "PlayStation VR2" },
  { id: "android", label: "Android" },
  { id: "ios", label: "iOS" },
  { id: "webgl", label: "WebGL" },
];

// ISO 639-1 codes (639-2 where there is no two-letter one).
export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh", label: "Chinese" },
  { id: "es", label: "Spanish" },
  { id: "hi", label: "Hindi" },
  { id: "ar", label: "Arabic" },
  { id: "pt", label: "Portuguese" },
  { id: "bn", label: "Bengali" },
  { id: "ru", label: "Russian" },
  { id: "ja", label: "Japanese" },
  { id: "de", label: "German" },
  { id: "fr", label: "French" },
  { id: "ko", label: "Korean" },
  { id: "it", label: "Italian" },
  { id: "tr", label: "Turkish" },
  { id: "vi", label: "Vietnamese" },
  { id: "pl", label: "Polish" },
  { id: "uk", label: "Ukrainian" },
  { id: "nl", label: "Dutch" },
  { id: "th", label: "Thai" },
  { id: "id", label: "Indonesian" },
  { id: "ms", label: "Malay" },
  { id: "tl", label: "Filipino (Tagalog)" },
  { id: "fa", label: "Persian" },
  { id: "he", label: "Hebrew" },
  { id: "ur", label: "Urdu" },
  { id: "ta", label: "Tamil" },
  { id: "te", label: "Telugu" },
  { id: "sw", label: "Swahili" },
  { id: "el", label: "Greek" },
  { id: "cs", label: "Czech" },
  { id: "sk", label: "Slovak" },
  { id: "sv", label: "Swedish" },
  { id: "da", label: "Danish" },
  { id: "fi", label: "Finnish" },
  { id: "no", label: "Norwegian" },
  { id: "is", label: "Icelandic" },
  { id: "hu", label: "Hungarian" },
  { id: "ro", label: "Romanian" },
  { id: "bg", label: "Bulgarian" },
  { id: "sr", label: "Serbian" },
  { id: "hr", label: "Croatian" },
  { id: "sl", label: "Slovenian" },
  { id: "mk", label: "Macedonian" },
  { id: "sq", label: "Albanian" },
  { id: "lt", label: "Lithuanian" },
  { id: "lv", label: "Latvian" },
  { id: "et", label: "Estonian" },
  { id: "be", label: "Belarusian" },
  { id: "ka", label: "Georgian" },
  { id: "hy", label: "Armenian" },
  { id: "az", label: "Azerbaijani" },
  { id: "kk", label: "Kazakh" },
  { id: "ca", label: "Catalan" },
];

/** The three things a game describes about itself. `max` is the sanity cap migration 0018 also enforces. */
export const FIELDS = {
  genres: { label: "Genres", short: "Genres", noun: "genre", options: GENRES, max: 32 },
  platforms: { label: "Platforms and devices", short: "Platforms", noun: "platform", options: PLATFORMS, max: 32 },
  languages: { label: "Languages", short: "Languages", noun: "language", options: LANGUAGES, max: 64 },
};

export const PROFILE_KEYS = ["genres", "platforms", "languages"];
export const TARGET_KEYS = ["genres", "platforms", "languages", "exclude_genres"];

const fieldOf = (key) => (key === "exclude_genres" ? "genres" : key);

export function labelOf(field, id) {
  return FIELDS[fieldOf(field)]?.options.find((option) => option.id === id)?.label ?? String(id);
}

/** Known ids only, once each, in the order of the official list. */
export function cleanList(value, field) {
  const given = new Set((Array.isArray(value) ? value : []).map(String));
  const definition = FIELDS[fieldOf(field)];
  return definition.options
    .map((option) => option.id)
    .filter((id) => given.has(id))
    .slice(0, definition.max);
}

// ------------------------------------------------------------------ the game's own description

/** What the developer entered, cleaned. Never throws. */
export function cleanProfile(input) {
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, cleanList(input?.[key], key)]));
}

/** For saving a game: each list needs at least one value. Returns { value } or { error }. */
export function validateProfile(input) {
  const value = cleanProfile(input);
  for (const key of PROFILE_KEYS) {
    if (value[key].length === 0) return { error: `Pick at least one ${FIELDS[key].noun}.` };
  }
  return { value };
}

/**
 * What a game row says about its own description.
 * known: false when the row has no such columns (migration 0018 not applied): nothing can be said.
 * missing: the lists that are still empty.
 */
export function profileGaps(game) {
  const known = PROFILE_KEYS.every((key) => Array.isArray(game?.[key]));
  if (!known) return { known: false, missing: [] };
  return { known: true, missing: PROFILE_KEYS.filter((key) => game[key].length === 0) };
}

/** The empty lists in plain words: ["genres", "languages"] -> "genres and languages". */
export function gapWords(missing) {
  const words = missing.map((key) => FIELDS[key].short.toLowerCase());
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

// ------------------------------------------------------------------ a creative's audience

/**
 * An audience from a form or from the browser: unknown ids are an error, an empty audience is
 * null. Returns { value } (null = every game) or { error }.
 */
export function parseTargeting(input) {
  if (input == null) return { value: null };
  if (typeof input !== "object" || Array.isArray(input)) return { error: "The audience is not valid." };

  const unknownKey = Object.keys(input).find((key) => !TARGET_KEYS.includes(key));
  if (unknownKey) return { error: `Unknown condition: ${unknownKey}.` };

  const value = {};
  for (const key of TARGET_KEYS) {
    const raw = input[key];
    if (raw == null) continue;
    if (!Array.isArray(raw)) return { error: "The audience is not valid." };
    const cleaned = cleanList(raw, key);
    if (cleaned.length !== new Set(raw.map(String)).size) {
      return { error: `Unknown ${FIELDS[fieldOf(key)].noun} in the audience.` };
    }
    if (cleaned.length) value[key] = cleaned;
  }

  const clash = (value.genres ?? []).find((id) => (value.exclude_genres ?? []).includes(id));
  if (clash) return { error: `${labelOf("genres", clash)} cannot be both wanted and excluded.` };

  return { value: Object.keys(value).length ? value : null };
}

/** Does this audience restrict anything? */
export function hasTargeting(targeting) {
  return (
    targeting != null &&
    typeof targeting === "object" &&
    !Array.isArray(targeting) &&
    TARGET_KEYS.some((key) => Array.isArray(targeting[key]) && targeting[key].length > 0)
  );
}

/** "Genres: Shooter, Horror · Platforms: Meta Quest · Not in genres: Casual", or "" for every game. */
export function targetingSummary(targeting) {
  if (!hasTargeting(targeting)) return "";
  const parts = [];
  for (const key of TARGET_KEYS) {
    const ids = Array.isArray(targeting[key]) ? targeting[key] : [];
    if (!ids.length) continue;
    const title = key === "exclude_genres" ? "Not in genres" : FIELDS[key].short;
    parts.push(`${title}: ${ids.map((id) => labelOf(key, id)).join(", ")}`);
  }
  return parts.join(" · ");
}

// ------------------------------------------------------------------ does it fit?

const list = (value) => (Array.isArray(value) ? value.map(String) : []);

/**
 * Does a game with this profile fit this audience?
 *   profile:   { genres, platforms, languages } (null or missing lists count as not filled in)
 *   targeting: an audience, or null for every game
 * Returns { fits, problems: [{ field, kind }] } where kind is "mismatch", "unfilled", "excluded"
 * or "invalid". An audience that is not shaped like one fails closed.
 */
export function evaluate(profile, targeting) {
  if (targeting == null) return { fits: true, problems: [] };
  if (typeof targeting !== "object" || Array.isArray(targeting)) {
    return { fits: false, problems: [{ field: "all", kind: "invalid" }] };
  }

  const problems = [];
  const add = (field, kind) => {
    if (!problems.some((item) => item.field === field && item.kind === kind)) problems.push({ field, kind });
  };

  for (const key of TARGET_KEYS) {
    const wanted = targeting[key];
    if (wanted == null) continue;
    if (!Array.isArray(wanted)) {
      add("all", "invalid");
      continue;
    }
    if (wanted.length === 0) continue;

    const field = fieldOf(key);
    const have = list(profile?.[field]);
    const ids = wanted.map(String);
    if (have.length === 0) add(field, "unfilled");
    else if (key === "exclude_genres") {
      if (have.some((id) => ids.includes(id))) add(field, "excluded");
    } else if (!ids.some((id) => have.includes(id))) add(field, "mismatch");
  }
  return { fits: problems.length === 0, problems };
}

export function fitsGame(profile, targeting) {
  return evaluate(profile, targeting).fits;
}

/** How many of these game profiles fit the audience. */
export function countFitting(profiles, targeting) {
  return profiles.filter((profile) => fitsGame(profile, targeting)).length;
}

/** Why a game does not fit, in a few words: "no matching genre; the game has not filled in its languages". */
export function whyNot(problems) {
  const words = [];
  for (const problem of problems) {
    let text;
    if (problem.kind === "invalid") text = "the audience settings are not valid";
    else if (problem.kind === "unfilled") text = `the game has not filled in its ${problem.field}`;
    else if (problem.kind === "excluded") text = "the game's genre is excluded";
    else text = `no matching ${FIELDS[problem.field].noun}`;
    if (!words.includes(text)) words.push(text);
  }
  return words.join("; ");
}

/**
 * The manifest's rows that may be served to a game. Only booked creatives carry an audience; the
 * developer's own creative (source "own") is the fallback and is never filtered.
 * rows: [{ source, row: { creatives: { targeting } } }]
 */
export function eligibleRows(rows, profile) {
  return rows.filter((item) => item.source !== "booking" || fitsGame(profile, item.row?.creatives?.targeting));
}
