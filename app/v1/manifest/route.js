import {
  authenticateGame,
  creativeUrl,
  guarded,
  isSchemaOutdated,
  json,
  logDbError,
  warnSchemaOutdated,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /v1/manifest
 * Called once when the game starts. Returns the creative each placement should
 * show, in the shape the Unity SDK already parses.
 *
 * Placements with no creative assigned are simply absent: the SDK then keeps the
 * developer's fallback texture, which is the correct behaviour for an unsold slot.
 * So are placements removed from the game (see POST /v1/placements).
 */
export const GET = guarded(async function GET(request) {
  const { game, db, error } = await authenticateGame(request);
  if (error) return error;

  let { data, error: queryError } = await activeAssignments(db, game, true);

  if (queryError && isSchemaOutdated(queryError)) {
    warnSchemaOutdated("GET /v1/manifest");
    ({ data, error: queryError } = await activeAssignments(db, game, false));
  }

  if (queryError) {
    logDbError("manifest", queryError);
    return json({ error: "Could not build the manifest." }, 500);
  }

  const placements = (data ?? []).map((row) => ({
    id: row.placements.external_id,
    creativeId: row.creatives.id,
    imageUrl: creativeUrl(db, row.creatives.storage_path),
  }));

  return json({ version: 1, placements });
});

function activeAssignments(db, game, skipRemoved) {
  let query = db
    .from("assignments")
    .select(
      `
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
