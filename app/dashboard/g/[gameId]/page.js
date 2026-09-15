import { notFound } from "next/navigation";
import { userClient } from "../../../../lib/supabase-server";
import { assignCreative } from "../../actions";

export const dynamic = "force-dynamic";

// A placement is drawn at its real aspect ratio, and its width tracks its
// physical width in the game world. These bounds keep a 30 m stadium banner and
// a 0.4 m sticker both legible on one screen.
const PX_PER_METRE = 26;
const MIN_WIDTH = 140;
const MAX_WIDTH = 340;

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
      livePlacements(db, gameId, true),
      db.from("creatives").select("id, name, width_px, height_px").eq("status", "approved"),
      // The count is exact; the rows (capped by the API) only feed the sessions figure.
      db.from("impressions").select("session_id", { count: "exact" }).eq("game_id", gameId),
    ]);

  // Before migration 0002 there is no removed_at column: show everything, as before.
  const { data: placements } =
    placementResult.error && ["42703", "PGRST204"].includes(placementResult.error.code)
      ? await livePlacements(db, gameId, false)
      : placementResult;

  const rows = placements ?? [];
  const sessions = new Set((impressions ?? []).map((row) => row.session_id));
  const assigned = rows.filter((row) => activeAssignment(row)).length;

  return (
    <>
      <div className="main-head">
        <h1>{game.name}</h1>
        <code className="key">{game.api_key}</code>
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
            In Unity, paste the key above into Tools → DeusADS → Settings, then press
            Send placements.
          </p>
        </div>
      ) : (
        <div className="surfaces">
          {rows.map((row) => (
            <Surface
              key={row.id}
              placement={row}
              creatives={creatives ?? []}
              gameId={gameId}
              db={db}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Surface({ placement, creatives, gameId, db }) {
  const assignment = activeAssignment(placement);
  const creative = assignment?.creatives ?? null;

  const aspect = Number(placement.aspect_ratio) || 16 / 9;
  const widthM = Number(placement.width_m) || 0;
  const width = widthM
    ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widthM * PX_PER_METRE))
    : 220;

  const imageUrl = creative
    ? db.storage.from("creatives").getPublicUrl(creative.storage_path).data.publicUrl
    : null;

  const crop = creative ? cropPercent(creative, aspect) : 0;

  return (
    <div className="surface" style={{ width: `${width}px` }}>
      <div
        className="surface-frame"
        style={{ width: `${width}px`, aspectRatio: String(aspect) }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={creative.name} />
        ) : (
          <div className="surface-empty">Shows your fallback</div>
        )}
      </div>

      <div>
        <div className="surface-label">{placement.label || placement.external_id}</div>
        <div className="surface-dims">
          {widthM && placement.height_m
            ? `${trim(widthM)} × ${trim(placement.height_m)} m · ${ratioLabel(aspect)}`
            : ratioLabel(aspect)}
          {placement.scene ? ` · ${placement.scene}` : ""}
        </div>
      </div>

      <form action={assignCreative} className="surface-form">
        <input type="hidden" name="placementId" value={placement.id} />
        <input type="hidden" name="gameId" value={gameId} />
        <select
          className="field"
          name="creativeId"
          defaultValue={creative?.id ?? ""}
          style={{ flex: 1 }}
        >
          <option value="">No creative</option>
          {creatives.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button className="button button-quiet" type="submit">
          Save
        </button>
      </form>

      {crop >= 5 && (
        <div className="surface-warn">
          {crop}% of this creative is cropped to fit. A {ratioLabel(aspect)} file fits
          exactly.
        </div>
      )}
    </div>
  );
}

/** Placements still in the game; ones removed by the last "Send placements" are hidden. */
function livePlacements(db, gameId, skipRemoved) {
  let query = db
    .from("placements")
    .select(
      `id, external_id, label, scene, aspect_ratio, width_m, height_m,
       assignments!left ( id, active, creatives ( id, name, storage_path, width_px, height_px ) )`
    )
    .eq("game_id", gameId)
    .order("scene", { ascending: true });

  if (skipRemoved) query = query.is("removed_at", null);
  return query;
}

function activeAssignment(placement) {
  return (placement.assignments ?? []).find((item) => item.active) ?? null;
}

/** How much of a creative is lost when cover-fitted to a surface. */
function cropPercent(creative, surfaceAspect) {
  if (!creative.width_px || !creative.height_px) return 0;
  const creativeAspect = creative.width_px / creative.height_px;
  const visible =
    creativeAspect > surfaceAspect
      ? surfaceAspect / creativeAspect
      : creativeAspect / surfaceAspect;
  return Math.round((1 - visible) * 100);
}

function ratioLabel(aspect) {
  const known = [
    [16 / 9, "16:9"],
    [4 / 3, "4:3"],
    [1, "1:1"],
    [3 / 4, "3:4"],
    [9 / 16, "9:16"],
    [21 / 9, "21:9"],
  ];
  const match = known.find(([value]) => Math.abs(value - aspect) / aspect < 0.04);
  return match ? match[1] : `${aspect.toFixed(2)}:1`;
}

function trim(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}
