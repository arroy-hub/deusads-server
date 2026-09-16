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

  // Newest schema first; each step back drops what a missing migration added.
  const attempts = [
    { skipRemoved: true, withCrop: true },
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
  const placements = (data ?? []).map((row) => ({
    id: row.placements.external_id,
    creativeId: row.creatives.id,
    imageUrl: creativeUrl(db, row.creatives.storage_path),
    crop: cropFromRow(row),
  }));

  return json({ version: 1, placements });
});

function activeAssignments(db, game, { skipRemoved, withCrop }) {
  let query = db
    .from("assignments")
    .select(
      `
      ${withCrop ? "crop_zoom, crop_x, crop_y," : ""}
      placements!inner ( external_id ),
      creatives!inner ( id, storage_path, status )
    `
    )
    .eq("owner_id", game.owner_id)
    .eq("active", true)
    .eq("placements.game_id", game.id)
    .eq("creatives.status", "approved");

  if (skipRemoved) query = query.is("placements.removed_at", null);
  return query;
}
