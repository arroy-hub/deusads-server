import { notFound } from "next/navigation";
import { userClient } from "../../../../lib/supabase-server";
import { isSchemaOutdated } from "../../../../lib/api";
import { cropFromRow, ratioLabel } from "../../../../lib/surface-math";
import ApiKey from "./api-key";
import SurfaceCard from "./surface-card";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }) {
  const { gameId } = await params;
  const db = await userClient();

  const { data: game } = await db
    .from("games")
    .select("id, name, api_key")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) notFound();

  const [placementResult, { data: creatives }, { data: impressions, count: impressionCount }] =
    await Promise.all([
      livePlacements(db, gameId, { skipRemoved: true, withCrop: true }),
      db
        .from("creatives")
        .select("id, name, storage_path, width_px, height_px")
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
      // The count is exact; the rows (capped by the API) only feed the sessions figure.
      db.from("impressions").select("session_id", { count: "exact" }).eq("game_id", gameId),
    ]);

  if (placementResult.error) {
    console.error("[DeusADS] dashboard placements query failed:", {
      gameId,
      code: placementResult.error.code,
      message: placementResult.error.message,
      details: placementResult.error.details,
      hint: placementResult.error.hint,
    });
  }

  // A database behind the code still shows its placements: without 0003 there is
  // no framing (cards say how to enable it), without 0002 nothing is hidden.
  let cropEnabled = true;
  let { data: placements, error: placementError } = placementResult;
  if (isSchemaOutdated(placementError)) {
    cropEnabled = false;
    ({ data: placements, error: placementError } = await livePlacements(db, gameId, { skipRemoved: true }));
  }
  if (isSchemaOutdated(placementError)) {
    ({ data: placements } = await livePlacements(db, gameId, {}));
  }

  // Placements removed by "Send placements" never show, even if the query filter
  // did not apply; the log says when that happens.
  const all = placements ?? [];
  const rows = all.filter((row) => !row.removed_at);
  if (rows.length !== all.length) {
    console.warn("[DeusADS] dashboard: removed placements came back from the filtered query", {
      gameId,
      hidden: all.length - rows.length,
    });
  }
  const sessions = new Set((impressions ?? []).map((row) => row.session_id));
  const assigned = rows.filter((row) => activeAssignment(row)).length;

  // URLs are built once here, so the cards can swap images without asking the server.
  const library = (creatives ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    width_px: item.width_px,
    height_px: item.height_px,
    url: db.storage.from("creatives").getPublicUrl(item.storage_path).data.publicUrl,
  }));

  return (
    <>
      <div className="main-head">
        <h1>{game.name}</h1>
        <ApiKey value={game.api_key} />
      </div>
      <p className="lede">
        Placements the SDK found in your scenes and prefabs, drawn at the size and
        proportions they have in the game. Placements you delete in Unity disappear
        from here the next time you press Send placements. Changing a creative here takes effect the next time a player
        starts the game — no new build.
      </p>

      <div className="panel" style={{ marginBottom: "2rem" }}>
        <div className="figures">
          <div>
            <div className="figure-value">{rows.length}</div>
            <div className="figure-label">Placements</div>
          </div>
          <div>
            <div className="figure-value">{assigned}</div>
            <div className="figure-label">Showing a creative</div>
          </div>
          <div>
            <div className="figure-value">{impressionCount ?? impressions?.length ?? 0}</div>
            <div className="figure-label">Impressions</div>
          </div>
          <div>
            <div className="figure-value">{sessions.size}</div>
            <div className="figure-label">Sessions</div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 auto 0.5rem" }}>No placements reported yet.</p>
          <p style={{ margin: "0 auto", fontSize: "0.875rem" }}>
            In Unity, paste the API key above into Tools → DeusADS → Settings, then
            press Send placements.
          </p>
        </div>
      ) : (
        <div className="surfaces">
          {rows.map((row) => (
            <Surface
              key={row.id}
              placement={row}
              library={library}
              db={db}
              cropEnabled={cropEnabled}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Surface({ placement, library, db, cropEnabled }) {
  const assignment = activeAssignment(placement);
  const current = assignment?.creatives ?? null;

  const aspect = Number(placement.aspect_ratio) || 16 / 9;
  const widthM = Number(placement.width_m) || 0;

  // An assigned creative that is no longer approved still shows as assigned.
  const creatives =
    current && !library.some((item) => item.id === current.id)
      ? [
          ...library,
          {
            id: current.id,
            name: current.name,
            width_px: current.width_px,
            height_px: current.height_px,
            url: db.storage.from("creatives").getPublicUrl(current.storage_path).data.publicUrl,
          },
        ]
      : library;

  const dims =
    (widthM && placement.height_m
      ? `${trim(widthM)} × ${trim(placement.height_m)} m · ${ratioLabel(aspect)}`
      : ratioLabel(aspect)) + (placement.scene ? ` · ${placement.scene}` : "");

  return (
    <SurfaceCard
      placementId={placement.id}
      aspect={aspect}
      label={placement.label || placement.external_id}
      dims={dims}
      creatives={creatives}
      savedCreativeId={current?.id ?? ""}
      savedCrop={cropFromRow(assignment)}
      cropEnabled={cropEnabled}
    />
  );
}

/** Placements still in the game; ones removed by the last "Send placements" are hidden. */
function livePlacements(db, gameId, { skipRemoved = false, withCrop = false }) {
  const columns = skipRemoved
    ? "id, external_id, label, scene, aspect_ratio, width_m, height_m, removed_at,"
    : "id, external_id, label, scene, aspect_ratio, width_m, height_m,";

  let query = db
    .from("placements")
    .select(
      `${columns}
       assignments!left ( id, active, ${withCrop ? "crop_zoom, crop_x, crop_y," : ""}
         creatives ( id, name, storage_path, width_px, height_px ) )`
    )
    .eq("game_id", gameId);

  if (skipRemoved) query = query.is("removed_at", null);
  return query.order("scene", { ascending: true });
}

function activeAssignment(placement) {
  return (placement.assignments ?? []).find((item) => item.active) ?? null;
}

function trim(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}
