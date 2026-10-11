import { notFound } from "next/navigation";
import { userClient } from "../../../../lib/supabase-server";
import { isSchemaOutdated } from "../../../../lib/api";
import { cropFromRow, ratioLabel } from "../../../../lib/surface-math";
import { formatLabel, formatOf } from "../../../../lib/formats";
import { fillDays, formatCount, parsePlacementFilter, placementRows, splitOwnDays } from "../../../../lib/analytics";
import { gapWords, profileGaps } from "../../../../lib/targeting";
import DailyChart from "./daily-chart";
import GameIcon from "../../game-icon";
import SettingsTab from "./settings-tab";
import SurfaceCard from "./surface-card";
import OpenToggle from "./open-toggle";
import PlacementStats from "./placement-stats";
import PlacementsOrganizer from "./placements-organizer";
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
  const { tab: requested, p: pickedParam, all: allParam, placement: focusParam } = await searchParams;
  // Performance counts the developer's own pictures apart; ?all=1 folds them into one figure.
  const combined = allParam === "1";
  const tab = TABS.some(([key]) => key === requested) ? requested : "placements";
  const db = await userClient();

  // What the game is (genres, platforms, languages) comes with migration 0018, its icon with 0019.
  const readGame = (columns) => db.from("games").select(columns).eq("id", gameId).maybeSingle();
  let { data: game, error: gameError } = await readGame("id, name, api_key, genres, platforms, languages, icon_path");
  const iconsReady = !isSchemaOutdated(gameError);
  if (!iconsReady) ({ data: game, error: gameError } = await readGame("id, name, api_key, genres, platforms, languages"));
  if (isSchemaOutdated(gameError)) ({ data: game } = await readGame("id, name, api_key"));

  if (!game) notFound();
  const gaps = profileGaps(game);
  const iconUrl = game.icon_path ? db.storage.from("creatives").getPublicUrl(game.icon_path).data.publicUrl : "";

  const [placementResult, stats] =
    await Promise.all([
      livePlacements(db, gameId, { skipRemoved: true, withCrop: true, withSource: true }),
      gameStats(db, gameId),
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
  // Without migration 0015 assignments have no source: they are all the developer's own.
  if (isSchemaOutdated(placementError)) {
    ({ data: placements, error: placementError } = await livePlacements(db, gameId, { skipRemoved: true, withCrop: true }));
  }
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
  // Which placements the Performance chart counts: those ticked in the table (all when none).
  const onlyPlacements = parsePlacementFilter(pickedParam, rows.map((row) => row.id));
  const analytics = tab === "performance" ? await gameAnalytics(db, gameId, ANALYTICS_DAYS, onlyPlacements, combined) : null;
  // "Open to advertisers" needs migration 0014; without it the switch is left out.
  const { data: openRows, error: openError } = await db
    .from("placements")
    .select("id, open_to_advertisers")
    .eq("game_id", gameId);
  const openOf = openError ? null : new Map((openRows ?? []).map((row) => [row.id, Boolean(row.open_to_advertisers)]));
  const openCount = openOf ? rows.filter((row) => openOf.get(row.id)).length : null;
  const withPictures = rows.filter((row) => ownAssignments(row).length > 0).length;

  // Folders, tags, switches, places (migration 0021). Null before it: the tab then lists placements as it always did.
  const organization = tab === "placements" && rows.length > 0 ? await loadOrganization(db, gameId, rows) : null;

  return (
    <>
      <div className="main-head">
        <div className="game-title">
          <GameIcon name={game.name} url={iconUrl} size="sm" />
          <h1>{game.name}</h1>
        </div>
      </div>
      {gaps.known && gaps.missing.length > 0 && (
        <p className="notice" style={{ marginBottom: "1rem" }}>
          Tell advertisers what this game is: fill in its {gapWords(gaps.missing)}. Ads aimed at a genre,
          platform or language only show in games that have said what they are.{" "}
          {tab !== "settings" && <Link href={`/dashboard/g/${game.id}?tab=settings`}>Fill it in</Link>}
        </p>
      )}
      {tab === "placements" && (
        <p className="lede">
          The ad spaces the SDK found in your game. Add your own pictures to each one (up to 5): they show in
          turn whenever no advertiser is booked. Switch a placement on to open it to advertisers and list it in their catalog.
          {openOf
            ? ` ${openCount} of ${rows.length} are open.`
            : " Run supabase/migrations/0014_open_to_advertisers.sql to choose which placements advertisers can book."}{" "}
          Changes reach players the next time they start the game, no new build needed.
        </p>
      )}
      {tab === "performance" && (
        <p className="lede">
          How often ads were shown in this game, by day and by placement. A view counts when a player had the
          placement on screen. Tick placements in the table to count only them in the chart.
        </p>
      )}
      {tab === "settings" && (
        <p className="lede">
          Icon, name and what the game is for advertisers; Save applies them together. The API key and deleting the game
          are separate and ask first.
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
            <div className="figure-value">{withPictures}</div>
            <div className="figure-label">With own pictures</div>
          </div>
          <div>
            <div className="figure-value">
              {formatCount(stats.own != null && !combined ? Math.max(0, stats.impressions - stats.own) : stats.impressions)}
            </div>
            <div className="figure-label">{combined ? "Impressions, all" : "Impressions"}</div>
          </div>
          {stats.own != null && !combined && (
            <div>
              <div className="figure-value">{formatCount(stats.own)}</div>
              <div className="figure-label">Own pictures</div>
            </div>
          )}
          <div>
            <div className="figure-value">
              {stats.sessions}
              {stats.sessionsApproximate ? "+" : ""}
            </div>
            <div className="figure-label">Sessions</div>
          </div>
        </div>
        {stats.own != null && (
          <p className="muted-line" style={{ margin: "0.75rem 0 0" }}>
            {combined
              ? "Views of your own pictures are counted together with advertisers' views."
              : "Views of your own pictures are counted apart from advertisers' views."}{" "}
            <Link href={`/dashboard/g/${game.id}?${new URLSearchParams({ tab: "performance", ...(pickedParam ? { p: pickedParam } : {}), ...(combined ? {} : { all: "1" }) })}`}>
              {combined ? "Count them apart" : "Combine into one figure"}
            </Link>
          </p>
        )}
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
                {analytics.filtered
                  ? `${onlyPlacements.length} of ${rows.length} placements`
                  : "all placements"}{" "}
                · {formatCount(analytics.days.reduce((sum, day) => sum + day.impressions, 0))} in total
              </span>
            </div>
            <DailyChart days={analytics.days} />
          </section>

          {onlyPlacements.length > 0 && !analytics.filtered && (
            <p className="notice">
              Run <code>supabase/migrations/0019_game_icon_and_placement_stats.sql</code> in the Supabase SQL editor
              to count the chart for chosen placements only.
            </p>
          )}

          {rows.length > 0 && (
            <PlacementStats
              gameId={game.id}
              rows={placementRows(rows, analytics.placements, analytics.ownPlacements, combined)}
              combined={combined}
              selected={onlyPlacements}
            />
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
      ) : organization ? (
        <PlacementsOrganizer
          gameId={game.id}
          folders={organization.folders}
          offScenes={organization.offScenes}
          focus={focusParam ? String(focusParam) : ""}
          items={rows.map((row) => ({
            ...organization.items.get(row.id),
            card: (
              <Surface placement={row} db={db} cropEnabled={cropEnabled}>
                {openOf && <OpenToggle placementId={row.id} initial={openOf.get(row.id) ?? false} />}
              </Surface>
            ),
          }))}
        />
      ) : (
        <div className="surfaces">
          {rows.map((row) => (
            <Surface
              key={row.id}
              placement={row}
              db={db}
              cropEnabled={cropEnabled}
            >
              {openOf && <OpenToggle placementId={row.id} initial={openOf.get(row.id) ?? false} />}
            </Surface>
          ))}
        </div>
      ))}

      {tab === "settings" && (
        <SettingsTab
          gameId={game.id}
          name={game.name}
          apiKey={game.api_key}
          iconUrl={iconUrl}
          iconsReady={iconsReady}
          profile={gaps.known ? { genres: game.genres, platforms: game.platforms, languages: game.languages } : null}
        />
      )}
    </>
  );
}

/**
 * What the Placements tab needs to organise many placements (migration 0021): each placement's folder, tags,
 * type and switch, where it stands, its views in the last days, and the game's folders and scenes switched off.
 * Null when the database does not have the migration yet, or a read fails: the tab then falls back to the plain list.
 */
async function loadOrganization(db, gameId, rows) {
  const [meta, folders, off, places, placeViews, placementViews] = await Promise.all([
    db
      .from("placements")
      .select("id, shared, enabled, folder_id, tags, place_type, place_type_suggested, first_seen_at")
      .eq("game_id", gameId)
      .is("removed_at", null),
    db.from("placement_folders").select("id, name, enabled, parent_id").eq("game_id", gameId).order("name"),
    db.from("placement_scene_off").select("scene").eq("game_id", gameId),
    db.from("placement_places").select("id, placement_id, scene, path").eq("game_id", gameId).is("removed_at", null),
    db.rpc("game_place_stats", { p_game_id: gameId, p_days: ANALYTICS_DAYS }),
    db.rpc("game_placement_stats", { p_game_id: gameId, p_days: ANALYTICS_DAYS }),
  ]);

  const failure = meta.error ?? folders.error ?? off.error ?? places.error;
  if (failure) {
    if (!isSchemaOutdated(failure)) console.error("[DeusADS] dashboard organisation query failed:", failure.code, failure.message);
    return null;
  }

  const metaOf = new Map((meta.data ?? []).map((row) => [row.id, row]));
  const viewsOfPlace = new Map((placeViews.error ? [] : placeViews.data ?? []).map((row) => [row.place_id, Number(row.impressions)]));
  const viewsOfPlacement = new Map((placementViews.error ? [] : placementViews.data ?? []).map((row) => [row.placement_id, Number(row.impressions)]));
  const placesOf = new Map();
  for (const place of places.data ?? []) {
    if (!placesOf.has(place.placement_id)) placesOf.set(place.placement_id, []);
    placesOf.get(place.placement_id).push({ id: place.id, scene: place.scene, path: place.path, views: viewsOfPlace.get(place.id) ?? null });
  }

  const items = new Map();
  for (const row of rows) {
    const m = metaOf.get(row.id) ?? {};
    const aspect = Number(row.aspect_ratio) || 0;
    const known = formatOf(aspect);
    // A placement reported before places existed has no place rows: its single scene stands in for one.
    const where = placesOf.get(row.id) ?? (row.scene ? [{ id: null, scene: row.scene, path: "", views: null }] : []);
    items.set(row.id, {
      id: row.id,
      externalId: row.external_id,
      label: row.label || row.external_id,
      shared: m.shared !== false,
      enabled: m.enabled !== false,
      folderId: m.folder_id ?? null,
      tags: m.tags ?? [],
      placeType: m.place_type ?? null,
      suggestedType: m.place_type_suggested ?? null,
      format: known ? formatLabel(known) : null,
      firstSeenAt: m.first_seen_at ?? null,
      places: where.sort((a, b) => `${a.scene}/${a.path}`.localeCompare(`${b.scene}/${b.path}`)),
      hasAds: (row.assignments ?? []).some((assignment) => assignment.active),
      views: viewsOfPlacement.get(row.id) ?? 0,
    });
  }

  return {
    items,
    folders: (folders.data ?? []).map((folder) => ({ id: folder.id, name: folder.name, enabled: folder.enabled !== false, parentId: folder.parent_id ?? null })),
    offScenes: (off.data ?? []).map((entry) => entry.scene),
  };
}

/**
 * Impressions per day and per placement for the last `days` days (migration 0007).
 * Null when the database does not have the functions yet: the page then just
 * leaves the analytics out rather than failing.
 */
async function gameAnalytics(db, gameId, days, onlyPlacements = [], combined = false) {
  // With placements picked, the per-day figures count only them (migration 0019); the table
  // always lists every placement. Without that function the chart keeps showing the whole game.
  const wholeGame = () => db.rpc("game_daily", { p_game_id: gameId, p_days: days });
  const chosen =
    onlyPlacements.length > 0
      ? await db.rpc("game_daily_by_placement", { p_game_id: gameId, p_days: days, p_placement_ids: onlyPlacements })
      : null;
  const filtered = Boolean(chosen && !chosen.error);
  const [daily, perPlacement, ownDaily, ownPlacements] = await Promise.all([
    filtered ? chosen : wholeGame(),
    db.rpc("game_placement_stats", { p_game_id: gameId, p_days: days }),
    // Views of the developer's own pictures (migration 0020); absent before it.
    db.rpc("game_own_daily", {
      p_game_id: gameId,
      p_days: days,
      p_placement_ids: filtered ? onlyPlacements : null,
    }),
    db.rpc("game_own_placement_stats", { p_game_id: gameId, p_days: days }),
  ]);
  const ownReady = !ownDaily.error && !ownPlacements.error;
  const error = daily.error ?? perPlacement.error;
  if (error) {
    console.warn("[DeusADS] dashboard: analytics unavailable (run migration 0007):", error.code, error.message);
    return null;
  }
  return {
    days: splitOwnDays(fillDays(daily.data, days), ownReady ? ownDaily.data ?? [] : null, combined),
    placements: perPlacement.data ?? [],
    ownPlacements: ownReady ? ownPlacements.data ?? [] : null,
    filtered,
  };
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
    // Own-picture views (migration 0020); null while it is not applied.
    const ownResult = await db.rpc("game_own_stats", { p_game_id: gameId }).single();
    const own = ownResult.error || !ownResult.data ? null : Number(ownResult.data.impressions);
    return { impressions: Number(data.impressions), sessions: Number(data.sessions), sessionsApproximate: false, own };
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
    own: null,
  };
}

function Surface({ placement, db, cropEnabled, children }) {
  const aspect = Number(placement.aspect_ratio) || 16 / 9;
  const widthM = Number(placement.width_m) || 0;

  const items = ownAssignments(placement)
    .filter((assignment) => assignment.creatives)
    .map((assignment) => ({
      assignmentId: assignment.id,
      id: assignment.creatives.id,
      name: assignment.creatives.name,
      url: db.storage.from("creatives").getPublicUrl(assignment.creatives.storage_path).data.publicUrl,
      width_px: assignment.creatives.width_px,
      height_px: assignment.creatives.height_px,
      enabled: Boolean(assignment.active),
      crop: cropFromRow(assignment),
    }));

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
      items={items}
      cropEnabled={cropEnabled}
    >
      {children}
    </SurfaceCard>
  );
}

/** Placements still in the game; ones removed by the last "Send placements" are hidden. */
function livePlacements(db, gameId, { skipRemoved = false, withCrop = false, withSource = false }) {
  const columns = skipRemoved
    ? "id, external_id, label, scene, aspect_ratio, width_m, height_m, removed_at,"
    : "id, external_id, label, scene, aspect_ratio, width_m, height_m,";

  let query = db
    .from("placements")
    .select(
      `${columns}
       assignments!left ( id, active, created_at, ${withSource ? "source," : ""} ${withCrop ? "crop_zoom, crop_x, crop_y," : ""}
         creatives ( id, name, storage_path, width_px, height_px ) )`
    )
    .eq("game_id", gameId);

  if (skipRemoved) query = query.is("removed_at", null);
  return query.order("scene", { ascending: true });
}

/** The developer's own pictures on a placement (assignments without a source are all own). */
function ownAssignments(placement) {
  // Always in the order the pictures were added: the database returns a row it has just updated
  // last, which would move a picture to the end whenever it is switched on or off.
  return (placement.assignments ?? [])
    .filter((item) => !item.source || item.source === "own")
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || String(a.id).localeCompare(String(b.id)));
}

function trim(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}
