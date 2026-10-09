import { notFound } from "next/navigation";
import { userClient } from "../../../../lib/supabase-server";
import { isSchemaOutdated } from "../../../../lib/api";
import { cropFromRow, ratioLabel } from "../../../../lib/surface-math";
import { formatLabel, formatOf } from "../../../../lib/formats";
import { fillDays, formatCount, placementRows } from "../../../../lib/analytics";
import ApiKey from "./api-key";
import DailyChart from "./daily-chart";
import GameSettings from "./game-settings";
import SurfaceCard from "./surface-card";
import OpenToggle from "./open-toggle";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ANALYTICS_DAYS = 30;

export async function generateMetadata({ params }) {
  const { gameId } = await params;
  const db = await userClient();
  const { data } = await db.from("games").select("name").eq("id", gameId).maybeSingle();
  return { title: data?.name ?? "Game" };
}

const TABS = [
  ["placements", "Placements"],
  ["performance", "Performance"],
  ["settings", "Settings"],
];

export default async function GamePage({ params, searchParams }) {
  const { gameId } = await params;
  const { tab: requested } = await searchParams;
  const tab = TABS.some(([key]) => key === requested) ? requested : "placements";
  const db = await userClient();

  const { data: game } = await db
    .from("games")
    .select("id, name, api_key")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) notFound();

  const [placementResult, { data: creatives }, stats, analytics] =
    await Promise.all([
      livePlacements(db, gameId, { skipRemoved: true, withCrop: true }),
      db
        .from("creatives")
        .select("id, name, storage_path, width_px, height_px")
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
      gameStats(db, gameId),
      gameAnalytics(db, gameId, ANALYTICS_DAYS),
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
  // "Open to advertisers" needs migration 0014; without it the switch is left out.
  const { data: openRows, error: openError } = await db
    .from("placements")
    .select("id, open_to_advertisers")
    .eq("game_id", gameId);
  const openOf = openError ? null : new Map((openRows ?? []).map((row) => [row.id, Boolean(row.open_to_advertisers)]));
  const openCount = openOf ? rows.filter((row) => openOf.get(row.id)).length : null;
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
      {tab === "placements" && (
        <p className="lede">
          Placements the SDK found in your game. Pick a creative for each one; changes reach players the
          next time they start the game, no new build.
          {openOf
            ? ` ${openCount} of ${rows.length} are open to advertisers: switch one on to list it in the advertiser catalog.`
            : " Run supabase/migrations/0014_open_to_advertisers.sql to choose which placements advertisers can book."}
        </p>
      )}

      <nav className="tabs" aria-label="Game sections">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/dashboard/g/${game.id}?tab=${key}`} className="tab" aria-current={tab === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "performance" && (
        <>
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
            <div className="figure-value">{stats.impressions}</div>
            <div className="figure-label">Impressions</div>
          </div>
          <div>
            <div className="figure-value">
              {stats.sessions}
              {stats.sessionsApproximate ? "+" : ""}
            </div>
            <div className="figure-label">Sessions</div>
          </div>
        </div>
      </div>


        </>
      )}

      {tab === "performance" && analytics && (
        <>
          <section className="panel analytics" aria-labelledby="daily-title">
            <div className="analytics-head">
              <h2 id="daily-title">Impressions per day</h2>
              <span className="analytics-sub">
                Last {ANALYTICS_DAYS} days · UTC ·{" "}
                {formatCount(analytics.days.reduce((sum, day) => sum + day.impressions, 0))} in total
              </span>
            </div>
            <DailyChart days={analytics.days} />
          </section>

          {rows.length > 0 && (
            <section className="panel analytics" aria-labelledby="by-placement-title" style={{ padding: 0 }}>
              <h2 id="by-placement-title" style={{ padding: "1.25rem 1.25rem 0.5rem" }}>
                By placement
              </h2>
              <table className="placement-table">
                <thead>
                  <tr>
                    <th>Placement</th>
                    <th className="num">Impressions</th>
                    <th className="num">Sessions</th>
                    <th className="num">Avg. visible</th>
                  </tr>
                </thead>
                <tbody>
                  {placementRows(rows, analytics.placements).map((row) => (
                    <tr key={row.id} className={row.removed ? "is-removed" : undefined}>
                      <td>
                        {row.label}
                        {row.scene && <span className="muted">{row.scene}</span>}
                      </td>
                      <td className="num">{formatCount(row.impressions)}</td>
                      <td className="num">{row.sessions == null ? "—" : formatCount(row.sessions)}</td>
                      <td className="num">{row.avgVisible == null ? "—" : `${row.avgVisible.toFixed(1)} s`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {tab === "placements" && (rows.length === 0 ? (
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
            >
              {openOf && <OpenToggle placementId={row.id} initial={openOf.get(row.id) ?? false} />}
            </Surface>
          ))}
        </div>
      ))}

      {tab === "settings" && <GameSettings gameId={game.id} name={game.name} />}
    </>
  );
}

/**
 * Impressions per day and per placement for the last `days` days (migration 0007).
 * Null when the database does not have the functions yet: the page then just
 * leaves the analytics out rather than failing.
 */
async function gameAnalytics(db, gameId, days) {
  const [daily, perPlacement] = await Promise.all([
    db.rpc("game_daily", { p_game_id: gameId, p_days: days }),
    db.rpc("game_placement_stats", { p_game_id: gameId, p_days: days }),
  ]);
  const error = daily.error ?? perPlacement.error;
  if (error) {
    console.warn("[DeusADS] dashboard: analytics unavailable (run migration 0007):", error.code, error.message);
    return null;
  }
  return { days: fillDays(daily.data, days), placements: perPlacement.data ?? [] };
}

/**
 * Exact impression and session counts (migration 0006). A database without it
 * still answers: impressions are counted exactly, but sessions come from the
 * rows PostgREST returns (at most 1000), so they are marked with a "+" when the
 * rows were cut short.
 */
async function gameStats(db, gameId) {
  const { data, error } = await db.rpc("game_stats", { p_game_id: gameId }).single();
  if (!error && data) {
    return { impressions: Number(data.impressions), sessions: Number(data.sessions), sessionsApproximate: false };
  }
  if (error) console.warn("[DeusADS] dashboard: game_stats unavailable, counting from rows:", error.code, error.message);

  const { data: rows, count } = await db
    .from("impressions")
    .select("session_id", { count: "exact" })
    .eq("game_id", gameId);

  const total = count ?? rows?.length ?? 0;
  return {
    impressions: total,
    sessions: new Set((rows ?? []).map((row) => row.session_id)).size,
    sessionsApproximate: total > (rows?.length ?? 0),
  };
}

function Surface({ placement, library, db, cropEnabled, children }) {
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
      : ratioLabel(aspect)) +
    (aspect > 0 ? ` · ${formatOf(aspect) ? formatLabel(formatOf(aspect)) : "custom shape"}` : "") +
    (placement.scene ? ` · ${placement.scene}` : "");

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
    >
      {children}
    </SurfaceCard>
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
