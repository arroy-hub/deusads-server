// How the dashboard lists many placements: grouping, filtering, sorting and the state each one is in.
// Pure functions over plain data, so the rules are tested without a browser (test/placement-view.test.mjs).
//
// An item is what the page knows about one placement:
//   { id, externalId, label, shared, enabled, folderId, tags, placeType, suggestedType,
//     aspect, format, places: [{ id, scene, path, views? }], hasAds, views }
// ctx is the game's folders and the scenes switched off:
//   { folders: [{ id, name, enabled, parentId? }], offScenes: Set<string> }

import { PLACE_TYPES } from "./placement-organization.js";

export const GROUP_BY = [
  ["folder", "Folder"],
  ["scene", "Scene"],
  ["tag", "Tag"],
  ["format", "Format"],
  ["type", "Place type"],
  ["status", "Status"],
];

export const SORT_BY = [
  ["manual", "My order"],
  ["name", "Name"],
  ["views", "Views, most first"],
  ["newest", "Newest first"],
];

export const STATUS_LABELS = { showing: "Showing ads", empty: "Empty", off: "Switched off", partly: "Off in some scenes" };
export const NO_SCENE = "(no scene)";

/** The kind of spot shown: the developer's choice, else the server's guess, else nothing. */
export function effectiveType(item) {
  return item.placeType || item.suggestedType || null;
}

export function typeLabel(id) {
  if (!id) return "Not determined";
  return PLACE_TYPES.find((type) => type.id === id)?.label ?? id;
}

/** True when a type came from the server's guess and the developer has not set one. */
export function typeIsSuggested(item) {
  return !item.placeType && Boolean(item.suggestedType);
}

function folderOff(folderId, ctx) {
  const byId = new Map((ctx.folders ?? []).map((folder) => [folder.id, folder]));
  const seen = new Set();
  for (let folder = byId.get(folderId); folder && !seen.has(folder.id); folder = byId.get(folder.parentId)) {
    if (folder.enabled === false) return true;
    seen.add(folder.id);
  }
  return false;
}

/**
 * showing | empty | off | partly.
 * off: switched off itself, or its folder is, or every scene it stands in is. partly: off in some of its
 * scenes only. Otherwise showing when something would be shown on it, else empty.
 */
export function stateOf(item, ctx) {
  if (item.enabled === false) return "off";
  if (item.folderId && folderOff(item.folderId, ctx)) return "off";
  const scenes = [...new Set(item.places.map((place) => place.scene))];
  const offScenes = ctx.offScenes ?? new Set();
  const offCount = scenes.filter((scene) => offScenes.has(scene)).length;
  if (scenes.length > 0 && offCount === scenes.length) return "off";
  if (offCount > 0) return "partly";
  return item.hasAds ? "showing" : "empty";
}

/** Why an item is off, in words, for the row: its own switch, its folder, or its scenes. */
export function offReason(item, ctx) {
  if (item.enabled === false) return "Switched off";
  if (item.folderId && folderOff(item.folderId, ctx)) {
    const folder = (ctx.folders ?? []).find((entry) => entry.id === item.folderId);
    return folder ? `Folder "${folder.name}" is off` : "Its folder is off";
  }
  const scenes = [...new Set(item.places.map((place) => place.scene))].filter((scene) => (ctx.offScenes ?? new Set()).has(scene));
  if (scenes.length === 0) return "";
  return `Scene${scenes.length > 1 ? "s" : ""} ${scenes.map((scene) => scene || NO_SCENE).join(", ")} off`;
}

/** Search text: name, ID, scenes, paths, tags, type. */
function haystack(item) {
  return [
    item.label,
    item.externalId,
    ...item.places.flatMap((place) => [place.scene, place.path]),
    ...item.tags,
    typeLabel(effectiveType(item)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Filters: { q, format, status, type, folder, tag, scene, sharing }; an empty value means "any".
 * folder: a folder id, or "none". type: a type id, or "none" for not determined.
 * sharing: "shared" | "unique". status: showing | empty | off (partly counts as off here).
 */
export function filterItems(items, filters, ctx) {
  const q = String(filters.q ?? "").trim().toLowerCase();
  return items.filter((item) => {
    if (q && !haystack(item).includes(q)) return false;
    if (filters.format && item.format !== filters.format) return false;
    if (filters.status) {
      const state = stateOf(item, ctx);
      const wanted = filters.status;
      if (wanted === "off" ? state !== "off" && state !== "partly" : state !== wanted) return false;
    }
    if (filters.type) {
      const type = effectiveType(item);
      if (filters.type === "none" ? type : type !== filters.type) return false;
    }
    if (filters.folder) {
      if (filters.folder === "none" ? item.folderId : item.folderId !== filters.folder) return false;
    }
    if (filters.tag && !item.tags.includes(filters.tag)) return false;
    if (filters.scene && !item.places.some((place) => place.scene === filters.scene)) return false;
    if (filters.sharing === "shared" && !item.shared) return false;
    if (filters.sharing === "unique" && item.shared) return false;
    return true;
  });
}

export function sortItems(items, sortBy = "manual") {
  const byName = (a, b) =>
    String(a.label || a.externalId).localeCompare(String(b.label || b.externalId), undefined, { numeric: true, sensitivity: "base" });
  const list = [...items];
  if (sortBy === "manual") {
    const at = (item) => (Number.isFinite(item.sortIndex) ? item.sortIndex : Infinity);
    return list.sort((a, b) => (at(a) === at(b) ? byName(a, b) : at(a) < at(b) ? -1 : 1));
  }
  if (sortBy === "views") return list.sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || byName(a, b));
  if (sortBy === "newest") return list.sort((a, b) => String(b.firstSeenAt ?? "").localeCompare(String(a.firstSeenAt ?? "")) || byName(a, b));
  return list.sort(byName);
}

/**
 * Groups: [{ key, label, kind, items }], in a sensible order. kind says what the group's switch does:
 * "scene" and "folder" groups have a switch of their own; the others switch their placements one by one.
 * A shared placement appears in each scene it stands in (it is still one placement: select and count by id).
 */
export function groupItems(items, groupBy, ctx) {
  const groups = new Map();
  const add = (key, label, kind, item, extra = {}) => {
    if (!groups.has(key)) groups.set(key, { key, label, kind, items: [], ...extra });
    const group = groups.get(key);
    if (!group.items.includes(item)) group.items.push(item);
  };

  for (const item of items) {
    if (groupBy === "scene") {
      const scenes = [...new Set(item.places.map((place) => place.scene))];
      if (scenes.length === 0) add("", NO_SCENE, "scene", item, { scene: "", sceneSwitch: false });
      for (const scene of scenes) add(scene, scene || NO_SCENE, "scene", item, { scene, sceneSwitch: scene !== "" });
    } else if (groupBy === "folder") {
      const folder = (ctx.folders ?? []).find((entry) => entry.id === item.folderId);
      if (folder) add(folder.id, folder.name, "folder", item, { folderId: folder.id, enabled: folder.enabled });
      else add("none", "Not in a folder", "plain", item);
    } else if (groupBy === "tag") {
      if (item.tags.length === 0) add("\u0000none", "No tags", "plain", item);
      for (const tag of item.tags) add(tag, tag, "plain", item);
    } else if (groupBy === "format") {
      add(item.format || "custom", item.format || "Custom shape", "plain", item);
    } else if (groupBy === "type") {
      const type = effectiveType(item);
      add(type || "none", typeLabel(type), "plain", item);
    } else {
      const state = stateOf(item, ctx);
      add(state, STATUS_LABELS[state], "plain", item);
    }
  }

  // Folders with nothing in them still appear when grouping by folder, so they can be switched or deleted.
  if (groupBy === "folder") {
    for (const folder of ctx.folders ?? []) {
      if (!groups.has(folder.id)) groups.set(folder.id, { key: folder.id, label: folder.name, kind: "folder", items: [], folderId: folder.id, enabled: folder.enabled });
    }
  }

  const order = { scene: 0, folder: 1, plain: 2 };
  const last = new Set(["", "none", "\u0000none"]);
  const statusOrder = ["showing", "empty", "partly", "off"];
  return [...groups.values()].sort((a, b) => {
    if (groupBy === "status") return statusOrder.indexOf(a.key) - statusOrder.indexOf(b.key);
    if (last.has(a.key) !== last.has(b.key)) return last.has(a.key) ? 1 : -1;
    return (order[a.kind] ?? 3) - (order[b.kind] ?? 3) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" });
  });
}

/** Distinct values to offer in the filter lists. */
export function facets(items, ctx) {
  const unique = (values) => [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return {
    formats: unique(items.map((item) => item.format).filter(Boolean)),
    scenes: unique(items.flatMap((item) => item.places.map((place) => place.scene)).filter((scene) => scene !== "")),
    tags: unique(items.flatMap((item) => item.tags)),
    types: unique(items.map((item) => effectiveType(item)).filter(Boolean)),
    hasUndetermined: items.some((item) => !effectiveType(item)),
    folders: ctx.folders ?? [],
  };
}

/** Counts for the summary line: placements are counted once, however many scenes they stand in. */
export function summarize(items, ctx) {
  const counts = { total: items.length, showing: 0, empty: 0, off: 0, partly: 0, places: 0 };
  for (const item of items) {
    counts[stateOf(item, ctx)] += 1;
    counts.places += Math.max(item.places.length, 1);
  }
  return counts;
}

// ---------------------------------------------------------------- saved views
// A saved view is a name plus the way of looking: { name, groupBy, sortBy, filters }.

export const MAX_VIEWS = 20;

export function cleanView(raw) {
  const name = String(raw?.name ?? "").trim().slice(0, 40);
  if (!name) return null;
  const groupBy = GROUP_BY.some(([key]) => key === raw?.groupBy) ? raw.groupBy : "folder";
  const sortBy = SORT_BY.some(([key]) => key === raw?.sortBy) ? raw.sortBy : "manual";
  const filters = {};
  for (const key of ["q", "format", "status", "type", "folder", "tag", "scene", "sharing"]) {
    if (typeof raw?.filters?.[key] === "string" && raw.filters[key]) filters[key] = raw.filters[key].slice(0, 120);
  }
  return { name, groupBy, sortBy, filters };
}

/** The list of saved views with one added or replaced by name (case-insensitive), at most MAX_VIEWS. */
export function withView(views, raw) {
  const view = cleanView(raw);
  if (!view) return views;
  const rest = views.filter((entry) => entry.name.toLowerCase() !== view.name.toLowerCase());
  return [...rest, view].slice(-MAX_VIEWS);
}
