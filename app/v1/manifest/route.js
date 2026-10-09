import {
  authenticateGame,
  creativeUrl,
  guarded,
  isSchemaOutdated,
  json,
  logDbError,
  preflight,
  warnSchemaOutdated,
} from "../../../lib/api";
import { cropFromRow } from "../../../lib/surface-math";
import { syncBookingSchedule } from "../../../lib/schedule";
import { rotate } from "../../../lib/rotation";
import { choosePictures } from "../../../lib/manifest-pick";

export const dynamic = "force-dynamic";

// WebGL builds send a preflight first: the key header is not a simple header.
export const OPTIONS = preflight;

/**
 * GET /v1/manifest
 * Called once when the game starts. Returns the creative each placement should
 * show, in the shape the Unity SDK already parses:
 *   { version: 1, placements: [ { id, creativeId, imageUrl, crop: { zoom, x, y } } ] }
 *
 * Placements with no creative assigned are simply absent: the SDK then keeps the
 * developer's fallback texture, which is the correct behaviour for an unsold slot.
 * So are placements removed from the game (see POST /v1/placements).
 */
export const GET = guarded(async function GET(request) {
  const { game, db, error } = await authenticateGame(request);
  if (error) return error;

  // Bookings that start or end today take effect before the manifest is built.
  await syncBookingSchedule(db);

  // Newest schema first; each step back drops what a missing migration added.
  const attempts = [
    { skipRemoved: true, withCrop: true, withSource: true, withFormats: true },
    { skipRemoved: true, withCrop: true, withSource: true, migration: "0017_ad_formats.sql" },
    { skipRemoved: true, withCrop: true, migration: "0015_open_marketplace.sql" },
    { skipRemoved: true, withCrop: false, migration: "0003_assignment_crop.sql" },
    { skipRemoved: false, withCrop: false, migration: "0002_placement_sync_and_events.sql" },
  ];

  let data;
  let queryError;
  for (const attempt of attempts) {
    if (attempt.migration) warnSchemaOutdated("GET /v1/manifest", attempt.migration);
    ({ data, error: queryError } = await activeAssignments(db, game, attempt));
    if (!isSchemaOutdated(queryError)) break;
  }

  if (queryError) {
    logDbError("manifest", queryError);
    return json({ error: "Could not build the manifest." }, 500);
  }

  // crop is always present; SDKs before 0.5 ignore it and cover-fit as before.
  // Several advertisers may rotate on one placement: one creative per placement per
  // session. Without migration 0015 every row counts as the developer's own.
  const rows = (data ?? []).map((row) => ({
    placementId: row.placements.external_id,
    source: row.source ?? "own",
    advertiserId: row.creatives.owner_id ?? null,
    creativeId: row.creatives.id,
    row,
  }));

  // Which picture each booked creative shows on each placement (migration 0017).
  // Where no picture fits the placement's shape the pair is dropped before the
  // rotation, so the placement shows another advertiser or the developer's own creative.
  const assetsOf = await loadAssets(db, rows);
  const { servable, shown } = choosePictures(rows, assetsOf, (path) => creativeUrl(db, path));
  // A suspended account's ads stop being served (suspended_at comes with migration 0015).
  const owners = [...new Set(servable.map((item) => item.advertiserId).filter(Boolean))];
  let suspended = new Set();
  if (owners.length) {
    const { data: off, error: offError } = await db
      .from("accounts")
      .select("id")
      .in("id", owners)
      .not("suspended_at", "is", null);
    if (!offError) suspended = new Set((off ?? []).map((account) => account.id));
  }
  const placements = rotate(servable.filter((item) => !suspended.has(item.advertiserId))).map(({ row }) => ({
    id: row.placements.external_id,
    creativeId: row.creatives.id,
    imageUrl: shown.get(row).imageUrl,
    crop: shown.get(row).crop,
  }));

  return json({ version: 1, placements });
});

/** Approved per-format images of the booked creatives, by creative id. Empty before migration 0017. */
async function loadAssets(db, rows) {
  const ids = [...new Set(rows.filter((item) => item.source === "booking").map((item) => item.creativeId))];
  const byCreative = new Map();
  if (!ids.length) return byCreative;
  const { data, error } = await db
    .from("creative_assets")
    .select("id, creative_id, format_id, aspect, storage_path, status")
    .in("creative_id", ids)
    .eq("status", "approved");
  if (error) return byCreative;
  for (const asset of data ?? []) {
    if (!byCreative.has(asset.creative_id)) byCreative.set(asset.creative_id, []);
    byCreative.get(asset.creative_id).push({
      id: asset.id,
      formatId: asset.format_id,
      aspect: Number(asset.aspect),
      status: asset.status,
      storagePath: asset.storage_path,
    });
  }
  return byCreative;
}

function activeAssignments(db, game, { skipRemoved, withCrop, withSource, withFormats }) {
  let query = db
    .from("assignments")
    .select(
      `
      ${withCrop ? "crop_zoom, crop_x, crop_y," : ""}
      ${withSource ? "source," : ""}
      placements!inner ( external_id${withFormats ? ", aspect_ratio" : ""} ),
      creatives!inner ( id, storage_path, status, owner_id${withFormats ? ", width_px, height_px, safe_x, safe_y, safe_w, safe_h" : ""} )
    `
    )
    .eq("owner_id", game.owner_id)
    .eq("active", true)
    .eq("placements.game_id", game.id)
    .eq("creatives.status", "approved");

  if (skipRemoved) query = query.is("placements.removed_at", null);
  return query;
}
