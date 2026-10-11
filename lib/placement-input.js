// Cleaning what the dashboard sends when a developer organises placements: names, tags, types, id lists.
// Pure, so the rules are tested (test/placement-input.test.mjs); the server actions call these first.

export const MAX_IDS = 500;
export const MAX_TAGS = 20; // per placement; the database enforces the same limit
export const MAX_TAG_LENGTH = 30;
export const MAX_FOLDER_NAME = 80;
export const MAX_TYPE_LENGTH = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isId(value) {
  return typeof value === "string" && UUID.test(value);
}

/** A list of placement ids: distinct, valid, at most MAX_IDS. Null when the list is unusable. */
export function cleanIds(list) {
  if (!Array.isArray(list)) return null;
  const ids = [...new Set(list.filter(isId))];
  if (ids.length === 0 || ids.length > MAX_IDS) return null;
  return ids;
}

/** One tag: trimmed, spaces collapsed, no commas, shortest form of what was typed. Empty when unusable. */
export function cleanTag(value) {
  return String(value ?? "")
    .replace(/[,\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_LENGTH);
}

/** Tags from a list or a comma-separated string; empty ones dropped, duplicates (any case) merged. */
export function cleanTags(input) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  const seen = new Set();
  const tags = [];
  for (const item of raw) {
    const tag = cleanTag(item);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

/** A placement's tags after adding and removing some. Null when it would exceed MAX_TAGS. */
export function changedTags(current, add = [], remove = []) {
  const drop = new Set(cleanTags(remove).map((tag) => tag.toLowerCase()));
  const kept = cleanTags(current).filter((tag) => !drop.has(tag.toLowerCase()));
  const result = cleanTags([...kept, ...cleanTags(add)]);
  return result.length > MAX_TAGS ? null : result;
}

/** A placement's tags with one renamed (merging into an existing tag of that name) or removed (to = ""). */
export function renamedTag(current, from, to) {
  const source = cleanTag(from).toLowerCase();
  const target = cleanTag(to);
  const result = [];
  for (const tag of cleanTags(current)) result.push(tag.toLowerCase() === source ? target : tag);
  return cleanTags(result);
}

export function cleanFolderName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FOLDER_NAME);
}

/** A place type the developer typed or picked. Null clears it (the server's guess shows again). */
export function cleanPlaceType(value) {
  if (value === null || value === undefined) return { value: null };
  const text = String(value).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { value: null };
  if (text.length > MAX_TYPE_LENGTH) return { error: `A place type is at most ${MAX_TYPE_LENGTH} characters.` };
  return { value: text };
}

/** A scene name as the SDK reports it; may be empty (placements outside any named scene have no switch). */
export function cleanScene(value) {
  if (typeof value !== "string") return null;
  const scene = value.trim();
  return scene.length > 0 && scene.length <= 200 ? scene : null;
}
