import { notFound } from "next/navigation";
import { userClient } from "../../../../lib/supabase-server";
import { isSchemaOutdated, serviceClient } from "../../../../lib/api";
import { cropFromRow, ratioLabel } from "../../../../lib/surface-math";
import { formatLabel, formatOf } from "../../../../lib/formats";
import { loadPerformance } from "../../../../lib/performance-data";
import { countNew, loadCampaigns } from "../../../../lib/campaigns-data";
import { connection } from "../../../../lib/connection";
import { gapWords, profileGaps } from "../../../../lib/targeting";
import GameIcon from "../../game-icon";
import SettingsTab from "./settings-tab";
import SurfaceCard from "./surface-card";
import OpenToggle from "./open-toggle";
import PerformanceTab from "./performance-tab";
import CampaignsTab from "./campaigns-tab";
import PlacementsOrganizer from "./placements-organizer";
import Link from "next/link";
import TabInfo from "./tab-info";

export const dynamic = "force-dynamic";

const ANALYTICS_DAYS = 30; // views per place shown on the Placements tab

export async function generateMetadata({ params }) {
  const { gameId } = await params;
  const db = await userClient();
  const { data } = await db.from("games").select("name").eq("id", gameId).maybeSingle();
  return { title: data?.name ?? "Game" };
}

const TABS = [
  ["placements", "Placements"],
  ["campaigns", "Campaigns"],
  ["performance", "Performance"],
  ["settings", "Settings"],
];

export default async function GamePage({ params, searchParams }) {
  const { gameId } = await params;
  const query = await searchParams;
  const { tab: requested, placement: focusParam } = query;
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

  // Only the Placements tab lists placements; Performance reads its own (lib/performance-data.js).
  const placementResult =
    tab === "placements"
      ? await livePlacements(db, gameId, { skipRemoved: true, withCrop: true, withSource: true })
      : { data: [], error: null };

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
  // What the Performance tab shows for its address; the game is the signed-in person's own (read under row-level
  // security above), which is what lets the server read the names of the creatives shown in it.
  const performance = tab === "performance" ? await loadPerformance({ db, service: serviceClient(), gameId, searchParams: query }) : null;
  // The Campaigns tab (migration 0023); the other tabs only need the number of new things for its badge.
  const campaigns = tab === "campaigns" ? await loadCampaigns({ db, service: serviceClient(), gameId }) : null;
  let newCount = 0;
  if (campaigns?.campaigns) newCount = campaigns.campaigns.filter((item) => item.isNew || item.creatives.some((creative) => creative.isNew)).length;
  else if (!campaigns) newCount = await countNew({ service: serviceClient(), gameId }).catch(() => 0);
  // How the SDK is connected (games.last_signal_at, migration 0024): a chip beside the title, details in Settings.
  const signal = await db.from("games").select("last_signal_at").eq("id", gameId).maybeSingle();
  const lastSignal = signal.data?.last_signal_at ?? null;
  const link = signal.error ? null : tab === "settings" ? await connectionOf(db, gameId, lastSignal) : connection(lastSignal);
  // "Open to advertisers" needs migration 0014; without it the switch is left out.
  const { data: openRows, error: openError } =
    tab === "placements" ? await db.from("placements").select("id, open_to_advertisers").eq("game_id", gameId) : { data: [], error: null };
  const openOf = openError ? null : new Map((openRows ?? []).map((row) => [row.id, Boolean(row.open_to_advertisers)]));
  const openCount = openOf ? rows.filter((row) => openOf.get(row.id)).length : null;
  const withPictures = rows.filter((row) => ownAssignments(row).length > 0).length;

  // Folders, tags, switches, places (migration 0021). Null before it: the tab then lists placements as it always did.
  const organization = tab === "placements" && rows.length > 0 ? await loadOrganization(db, gameId, rows) : null;

  const tabInfo =
    tab === "placements"
      ? `The ad spaces the SDK found in your game. Add your own creatives to each one (up to 5): they show in turn whenever no advertiser is booked. Switch a placement on to open it to advertisers and list it in their catalog.${
          openOf ? ` ${openCount} of ${rows.length} are open.` : " Run supabase/migrations/0014_open_to_advertisers.sql to choose which placements advertisers can book."
        } Changes reach players the next time they start the game, no new build needed.`
      : tab === "campaigns"
        ? "The advertisers that booked this game. Pause or block a campaign, one creative or a whole advertiser, or a whole category. Everything here applies to this game only, nothing is cancelled, and you can take it back at any time."
        : tab === "performance"
          ? "How often ads were shown in this game, and whose they were. A view counts when a player had the placement on screen."
          : "";

  return (
    <>
      <div className="main-head">
        <div className="game-title">
          <GameIcon name={game.name} url={iconUrl} size="sm">
            {link && (
              <Link href={`/dashboard/g/${game.id}?tab=settings`} className={`conn-dot conn-${link.mode}`} aria-label={`SDK: ${link.chip}`}>
                <b />
              </Link>
            )}
          </GameIcon>
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
      <nav className="tabs" aria-label="Game sections">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/dashboard/g/${game.id}?tab=${key}`} className="tab" aria-current={tab === key ? "page" : undefined}>
            {label}
            {key === "campaigns" && newCount > 0 && <span className="cp-count" style={{ marginLeft: "0.5rem" }} title="Campaigns with something new">{newCount}</span>}
          </Link>
        ))}
        <TabInfo label={TABS.find(([key]) => key === tab)?.[1] ?? "this tab"} text={tabInfo} />
      </nav>

      {tab === "campaigns" && campaigns?.days && <CampaignsTab gameId={game.id} model={campaigns} />}
      {tab === "campaigns" && campaigns?.error === "migration" && (
        <p className="notice">
          Run <code>supabase/migrations/0023_game_ad_controls.sql</code> in the Supabase SQL editor to turn the Campaigns tab on.
        </p>
      )}
      {tab === "campaigns" && campaigns?.error === "failed" && (
        <p className="notice">The campaigns could not be read just now. Reload the page; if it keeps happening, the server log says why.</p>
      )}

      {tab === "performance" && performance?.model && (
        <PerformanceTab gameId={game.id} model={performance.model} defaultBy={performance.defaultBy} />
      )}
      {tab === "performance" && performance?.error === "migration" && (
        <p className="notice">
          Run <code>supabase/migrations/0022_game_performance.sql</code> in the Supabase SQL editor to turn the
          Performance tab on.
        </p>
      )}
      {tab === "performance" && performance?.error === "failed" && (
        <p className="notice">The figures could not be read just now. Reload the page; if it keeps happening, the server log says why.</p>
      )}

      {tab === "placements" && (rows.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 auto 0.5rem" }}>No placements reported yet.</p>
          <p style={{ margin: "0 auto", fontSize: "0.875rem" }}>
            Copy the API key from the Settings tab of this game, paste it into Unity at
            Tools → DeusADS → Settings, then press Send placements.
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
          link={link}
          profile={gaps.known ? { genres: game.genres, platforms: game.platforms, languages: game.languages } : null}
        />
      )}
    </>
  );
}

/** The SDK connection of a game with the figures its details show. */
async function connectionOf(db, gameId, lastSignalAt) {
  const state = connection(lastSignalAt);
  const [sent, first, created] = await Promise.all([
    db.from("placements").select("id", { count: "exact", head: true }).eq("game_id", gameId).is("removed_at", null),
    db.from("impressions").select("occurred_at").eq("game_id", gameId).order("occurred_at", { ascending: true }).limit(1),
    db.from("games").select("created_at").eq("id", gameId).maybeSingle(),
  ]);
  const placements = sent.error ? 0 : sent.count ?? 0;
  const firstAt = first.error ? null : first.data?.[0]?.occurred_at ?? null;
  const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return {
    ...state,
    placements,
    firstImpression: firstAt ? day(firstAt) : "—",
    steps: [
      { title: "API key issued", done: true, when: created.data?.created_at ? day(created.data.created_at) : "" },
      { title: "Placements sent from Unity (Send placements)", done: placements > 0, when: placements > 0 ? `${placements} placements` : "Paste the key into Tools → DeusADS → Settings, then press Send placements" },
      { title: "SDK asked for the manifest", done: Boolean(lastSignalAt), when: lastSignalAt ? state.last : "Run the game once with the SDK in it" },
      { title: "First impression received", done: Boolean(firstAt), when: firstAt ? day(firstAt) : "Appears after a placement is on screen" },
    ],
  };
}

/**
 * What the Placements tab needs to organise many placements (migration 0021): each placement's folder, tags,
 * type and switch, where it stands, its views in the last days, and the game's folders and scenes switched off.
 * Null when the database does not have the migration yet, or a read fails: the tab then falls back to the plain list.
 */
async function loadOrganization(db, gameId, rows) {
  const [meta, folders, off, places, placeViews, placementViews, order] = await Promise.all([
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
    // The developer's own order (migration 0025). Kept apart: without the migration only this read fails, not the tab.
    db.from("placements").select("id, sort_index").eq("game_id", gameId).is("removed_at", null),
  ]);

  const failure = meta.error ?? folders.error ?? off.error ?? places.error;
  if (failure) {
    if (!isSchemaOutdated(failure)) console.error("[DeusADS] dashboard organisation query failed:", failure.code, failure.message);
    return null;
  }

  const metaOf = new Map((meta.data ?? []).map((row) => [row.id, row]));
  const orderOf = new Map((order.error ? [] : order.data ?? []).map((row) => [row.id, row.sort_index]));
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
      sortIndex: orderOf.get(row.id) ?? null,
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
