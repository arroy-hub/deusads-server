// Pure rules for organising placements (migration 0021): what the SDK reports about where a
// placement stands, which type of spot it looks like, and what is switched off.

export const PLACE_TYPES = [
  { id: "menu", label: "Menu", words: ["menu", "mainmenu", "title", "lobby", "home", "settings", "options"] },
  { id: "loading", label: "Loading", words: ["loading", "splash", "boot", "intro"] },
  { id: "shop", label: "Shop", words: ["shop", "store", "market", "vendor", "inventory"] },
  { id: "hud", label: "HUD", words: ["hud", "overlay", "scoreboard", "minimap"] },
  { id: "gameplay", label: "Gameplay", words: ["level", "arena", "stage", "game", "world", "map", "track", "field", "court", "city"] },
];

/**
 * A guess at the kind of spot, from the scene name and the path of the object.
 * Returns null when nothing matches ("not determined"): the dashboard then offers a filter for those.
 */
export function suggestPlaceType(scene, path) {
  const tokens = `${scene ?? ""} ${path ?? ""}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const joined = tokens.join("");
  for (const type of PLACE_TYPES) {
    if (type.words.some((word) => tokens.includes(word) || (word.length >= 5 && joined.includes(word)))) {
      return type.id;
    }
  }
  return null;
}

/**
 * The places one placement item from the SDK reports.
 * SDK 0.6+ sends `places: [{ scene, path }]`; older SDKs send a single `scene`.
 * SDK 0.13+ adds how the picture sits on the surface there (migration 0051): `shape` 0 fine, 1 stretched,
 * 2 too distorted to be shown, and `worst`, the stretch or squeeze that at least 1% of the picture suffers.
 * Both are kept only when they are valid, so a report without them reads as before.
 * Duplicates (same scene and path) collapse to one, keeping the worse shape.
 */
export function placesOf(item) {
  const list = Array.isArray(item?.places) ? item.places : [];
  const seen = new Map();
  const places = [];
  const add = (scene, path, shape, worst) => {
    const place = {
      scene: typeof scene === "string" ? scene.slice(0, 200) : "",
      path: typeof path === "string" ? path.slice(0, 400) : "",
    };
    if (Number.isInteger(shape) && shape >= 0 && shape <= 2) {
      place.shape = shape;
      if (typeof worst === "number" && Number.isFinite(worst) && worst >= 1) place.worst = Math.min(worst, 1000);
    }
    const key = `${place.scene}\u0000${place.path}`;
    const known = seen.get(key);
    if (known) {
      if (place.shape !== undefined && (known.shape === undefined || place.shape > known.shape)) {
        known.shape = place.shape;
        if (place.worst !== undefined) known.worst = place.worst;
      }
      return;
    }
    seen.set(key, place);
    places.push(place);
  };
  for (const entry of list) add(entry?.scene, entry?.path, entry?.shape, entry?.worst);
  if (places.length === 0 && typeof item?.scene === "string") add(item.scene, "");
  return places;
}

/** True when the placement stands somewhere and every place it stands in is too distorted to be shown (migration 0051). */
export function shapeBlockedOf(places) {
  return Array.isArray(places) && places.length > 0 && places.every((place) => place.shape === 2);
}

/**
 * What the game must hide, from the developer's switches. "Off wins": a placement shows nothing
 * when it is off itself, or its folder is off, or every place it stands in is too distorted (shape_blocked, migration 0051). A scene that is off hides every copy standing
 * in that scene, whenever it was added; that goes to the SDK as a scene name, not as ids.
 *
 *   placements: [{ external_id, enabled, folder_id, shape_blocked?, removed_at? }]
 *   folders:    [{ id, enabled, parent_id? }]
 *   offScenes:  [{ scene }]
 *
 * Returns { disabled: [external_id], disabledScenes: [scene] }. Removed placements are not listed.
 */
export function switchedOff({ placements = [], folders = [], offScenes = [] }) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const folderOff = (id) => {
    const seen = new Set();
    for (let folder = byId.get(id); folder && !seen.has(folder.id); folder = byId.get(folder.parent_id)) {
      if (folder.enabled === false) return true;
      seen.add(folder.id);
    }
    return false;
  };

  const disabled = placements
    .filter((placement) => !placement.removed_at)
    .filter((placement) => placement.enabled === false || placement.shape_blocked === true || (placement.folder_id && folderOff(placement.folder_id)))
    .map((placement) => placement.external_id)
    .sort();

  const disabledScenes = [...new Set(offScenes.map((row) => row.scene))].sort();
  return { disabled, disabledScenes };
}
