// Reads what lib/game-pictures.js needs to say which picture a booked creative shows on a placement, and whether it
// shows anything there at all. A campaign whose creatives have no picture for any placement of a game is not in that
// game: it is not listed for the developer, not announced, and not counted as running there for the advertiser.
// Only talks to Supabase; the rule itself is in lib/game-pictures.js (and in the manifest, lib/manifest-pick.js).

import { isSchemaOutdated } from "./api.js";
import { landsOn } from "./game-pictures.js";

const CHUNK = 150;

/** `.in()` over a long list of ids, in pieces, so the request never grows past what the API accepts. */
async function readIn(read, ids) {
  const rows = [];
  for (let from = 0; from < ids.length; from += CHUNK) {
    const { data, error } = await read(ids.slice(from, from + CHUNK));
    if (error) return { error };
    rows.push(...(data ?? []));
  }
  return { rows };
}

const numberOrNull = (value) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value));

/**
 * The shapes of placements and the pictures of creatives:
 *   placementOf  Map(id -> { id, name, aspect, gameId })
 *   creativeOf   Map(id -> { id, name, storagePath, category, aspect, safeZone, formatCrops })
 *   assetsOf     Map(creativeId -> [{ id, formatId, aspect, status: "approved", storagePath }])
 * Null when something could not be read: the callers then treat every booking as showing, as before migration 0017.
 */
export async function loadPictureInputs(service, { creativeIds = [], placementIds = [] }) {
  const creatives = [...new Set(creativeIds.filter(Boolean))];
  const placements = [...new Set(placementIds.filter(Boolean))];

  const base = "id, name, storage_path, ad_category, width_px, height_px, safe_x, safe_y, safe_w, safe_h";
  const readCreatives = async (columns) => readIn((ids) => service.from("creatives").select(columns).in("id", ids), creatives);
  let creativeRows = await readCreatives(`${base}, format_crops`);
  if (isSchemaOutdated(creativeRows.error)) creativeRows = await readCreatives(base); // before migration 0028
  if (creativeRows.error) return null;

  const [placementRows, assetRows] = await Promise.all([
    readIn((ids) => service.from("placements").select("id, label, external_id, game_id, aspect_ratio").in("id", ids), placements),
    readIn((ids) => service.from("creative_assets").select("id, creative_id, format_id, aspect, storage_path, status").in("creative_id", ids).eq("status", "approved"), creatives),
  ]);
  if (placementRows.error || assetRows.error) return null;

  const assetsOf = new Map();
  for (const asset of assetRows.rows) {
    if (!assetsOf.has(asset.creative_id)) assetsOf.set(asset.creative_id, []);
    assetsOf.get(asset.creative_id).push({ id: asset.id, formatId: asset.format_id, aspect: Number(asset.aspect), status: asset.status, storagePath: asset.storage_path });
  }
  return {
    placementOf: new Map(placementRows.rows.map((row) => [row.id, { id: row.id, name: row.label || row.external_id || "Placement", aspect: numberOrNull(row.aspect_ratio), gameId: row.game_id }])),
    creativeOf: new Map(
      creativeRows.rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          storagePath: row.storage_path,
          category: row.ad_category ?? "other",
          aspect: row.width_px && row.height_px ? row.width_px / row.height_px : null,
          safeZone: { x: row.safe_x, y: row.safe_y, w: row.safe_w, h: row.safe_h },
          formatCrops: row.format_crops ?? null,
        },
      ])
    ),
    assetsOf,
  };
}

/**
 * (creativeId, placementId) -> does the creative show a picture on that placement? Built from loadPictureInputs.
 * With nothing read (null), or a creative or placement that is not known, the answer is yes: nothing is hidden by a
 * read that failed.
 */
export function landingTest(inputs) {
  if (!inputs) return () => true;
  const known = new Map();
  return (creativeId, placementId) => {
    const key = `${creativeId}:${placementId}`;
    if (known.has(key)) return known.get(key);
    const creative = inputs.creativeOf.get(creativeId);
    const placement = inputs.placementOf.get(placementId);
    const lands = !creative || !placement ? true : landsOn({ creative, assets: inputs.assetsOf.get(creativeId) ?? [], aspect: placement.aspect });
    known.set(key, lands);
    return lands;
  };
}

/** The test for a list of bookings ({ creative_id, placement_id } rows): one read for all of them. */
export async function loadLanding(service, bookings) {
  const rows = bookings ?? [];
  if (!rows.length) return () => true;
  const inputs = await loadPictureInputs(service, { creativeIds: rows.map((row) => row.creative_id ?? row.creativeId), placementIds: rows.map((row) => row.placement_id ?? row.placementId) }).catch(() => null);
  return landingTest(inputs);
}
