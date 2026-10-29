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
import { afterResponse } from "../../../lib/after-response";
import { cropFromRow } from "../../../lib/surface-math";
import { syncBookingSchedule } from "../../../lib/schedule";
import { rotate } from "../../../lib/rotation";
import { choosePictures } from "../../../lib/manifest-pick";
import { variantsBySource } from "../../../lib/astc-variants";
import { eligibleRows } from "../../../lib/targeting";
import { switchedOff } from "../../../lib/placement-organization";
import { blockedCategories, controlMap, mayServe } from "../../../lib/game-controls";
import { campaignMayServe, effectivePause } from "../../../lib/campaign-rules";
import { slotStates } from "../../../lib/fill-rate";

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
 *
 * What the developer switched off (migration 0021) is listed too, so the SDK can hide it entirely
 * (no creative, no fallback texture): `disabled` holds placement ids that show nothing anywhere
 * (the placement itself or its folder is off, or every place it stands in is too distorted: migration 0051), `disabledScenes` holds scene names in which every
 * placement shows nothing. SDKs before 0.6 ignore both and keep their fallback texture there.
 */
export const GET = guarded(async function GET(request) {
  const { game, db, error } = await authenticateGame(request);
  if (error) return error;

  // Bookings that start or end today are switched on by the database itself every minute (migration 0049).
  // The same is asked here once a minute per server instance, but after the answer has gone out, so the
  // manifest never waits for it and a database without 0049 still starts a booking at the next game start.
  await afterResponse(() => syncBookingSchedule(db));

  // The manifest is built in three rounds of queries; whatever does not depend on an earlier answer is asked
  // together with it, because each query costs a round trip to the database.
  // Round 1: the creatives assigned to this game, and what the developer switched off.
  const [{ data, error: queryError }, off] = await Promise.all([findAssignments(db, game), loadSwitches(db, game)]);

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
    assignmentId: row.id,
    category: row.creatives.ad_category ?? null,
    row,
  }));

  // Round 2: everything the choice below needs from the database. Asked for all rows at once, because which of
  // them are eligible is only known after the game's description is read; what is not needed is simply not used.
  // A booked creative may ask for a kind of game (migration 0018): genres, platforms, languages.
  // Those that do not fit this game are dropped before the rotation, so the placement shows
  // another advertiser or the developer's own creative. The game's own description is read only
  // when some booked creative has an audience; a game that has not filled in what a creative
  // asks for does not get it (strict).
  const targeted = rows.some((item) => isBooked(item) && item.row.creatives.targeting != null);
  const profileOf = once(() => loadProfile(db, game));
  const [profile, assetsOf, cropsOf, suspended, controlTables, bookings] = await Promise.all([
    targeted ? profileOf() : null,
    loadAssets(db, rows), // which picture each booked creative shows on each placement (migration 0017)
    loadFormatCrops(db, rows),
    loadSuspended(db, rows), // a suspended account's ads stop being served
    loadControlTables(db, game, rows), // what the developer paused or blocked in this game (migration 0023)
    loadBookings(db, rows),
  ]);

  const eligible = targeted ? eligibleRows(rows, profile) : rows;

  // Where no picture fits the placement's shape the pair is dropped before the
  // rotation, so the placement shows another advertiser or the developer's own creative.
  const { servable, shown } = choosePictures(eligible, assetsOf, (path) => creativeUrl(db, path), cropsOf);

  // What the developer switched off shows nothing: dropped before the rotation, and named in the reply.
  const disabled = new Set(off.disabled);

  const controls = servable.some(isBooked) ? buildControls(controlTables, bookings) : null;
  const allowed = (item) =>
    !controls ||
    mayServe(
      {
        source: item.source,
        campaignId: controls.campaignOf.get(item.assignmentId),
        advertiserId: item.advertiserId,
        creativeId: item.creativeId,
        category: item.category,
      },
      controls
    );

  // Round 3: what the campaigns themselves decide (migration 0026): paused, their own audience, games they skip.
  const servableIds = new Set(servable.map((item) => item.assignmentId));
  const campaignRules = await loadCampaignRules(
    db,
    game,
    (bookings ?? []).filter((booking) => servableIds.has(booking.assignment_id)),
    profileOf
  );
  const campaignAllows = (item) => item.source !== "booking" || !campaignRules || campaignMayServe(campaignRules.ruleOf.get(item.assignmentId), game.id, campaignRules.profile);

  // The same steps one at a time, so a placement left empty can be explained (migration 0037).
  const notSuspended = servable.filter((item) => !suspended.has(item.advertiserId));
  const notBlocked = notSuspended.filter((item) => !disabled.has(item.placementId) && allowed(item));
  const chosen = rotate(notBlocked.filter(campaignAllows));
  // Compressed copies (migration 0055) of the pictures being served, for SDKs that can use them (headsets, phones).
  // Older SDKs ignore the field; a picture without copies simply has no `variants`.
  const variants = await variantsBySource(db, chosen.map(({ row }) => shown.get(row).path)).catch(() => new Map());
  const placements = chosen.map(({ row }) => {
    const picked = shown.get(row);
    const copies = variants.get(picked.path);
    return {
      id: row.placements.external_id,
      creativeId: row.creatives.id,
      imageUrl: picked.imageUrl,
      crop: picked.crop,
      ...(copies?.length ? { variants: copies } : {}),
    };
  });

  // Counted after the answer has gone out: the fill rate is for the developer's dashboard, not for the game.
  await afterResponse(() => recordFill(db, game, { levels: [rows, eligible, servable, notSuspended, notBlocked], chosen, disabled }));

  return json({ version: 1, placements, disabled: off.disabled, disabledScenes: off.disabledScenes });
});

// Newest schema first; each step back drops what a missing migration added.
const ATTEMPTS = [
  { skipRemoved: true, withCrop: true, withSource: true, withFormats: true, withTargeting: true },
  { skipRemoved: true, withCrop: true, withSource: true, withFormats: true, migration: "0018_targeting.sql" },
  { skipRemoved: true, withCrop: true, withSource: true, migration: "0017_ad_formats.sql" },
  { skipRemoved: true, withCrop: true, migration: "0015_open_marketplace.sql" },
  { skipRemoved: true, withCrop: false, migration: "0003_assignment_crop.sql" },
  { skipRemoved: false, withCrop: false, migration: "0002_placement_sync_and_events.sql" },
];

const isBooked = (item) => item.source === "booking";

/** Runs `load` the first time it is asked for and gives every later caller the same answer. */
function once(load) {
  let answer;
  return () => (answer ??= load());
}

/** The creatives assigned to this game: { data, error }, on the newest schema the database has. */
async function findAssignments(db, game) {
  let result;
  for (const attempt of ATTEMPTS) {
    if (attempt.migration) warnSchemaOutdated("GET /v1/manifest", attempt.migration);
    result = await activeAssignments(db, game, attempt);
    if (!isSchemaOutdated(result.error)) break;
  }
  return result;
}

/**
 * Remembers what this request did for every placement of the game: an ad of an advertiser, the developer's own
 * creative, or the reason it stayed empty (migration 0037, shown as the fill rate in the developer's Performance tab).
 * Never fails the request: a missing table or a database hiccup only means this request is not counted.
 */
async function recordFill(db, game, { levels, chosen, disabled }) {
  try {
    const { data: live, error: liveError } = await db.from("placements").select("external_id").eq("game_id", game.id).is("removed_at", null);
    if (liveError) return;
    const states = slotStates({ slots: (live ?? []).map((row) => row.external_id), disabled, levels, chosen });
    if (Object.keys(states).length === 0) return;
    const { error: recordError } = await db.rpc("record_manifest_fill", { p_game_id: game.id, p_owner: game.owner_id, p_slots: states });
    if (!recordError) return;
    if (isSchemaOutdated(recordError) || recordError.code === "PGRST202" || recordError.code === "42883") warnSchemaOutdated("GET /v1/manifest", "0037_fill_rate.sql");
    else logDbError("manifest fill", recordError);
  } catch (error) {
    console.error("[DeusADS] manifest fill:", error);
  }
}

/**
 * The pauses and blocks the developer set in this game (migration 0023), as the rows read:
 * { controlRows, categoryRows }. Null when nothing booked is in play, and when they cannot be read:
 * a read failure must not hide a developer's ads, and the manifest is asked again at the next start.
 */
async function loadControlTables(db, game, rows) {
  if (!rows.some(isBooked)) return null;

  const [controls, categories] = await Promise.all([
    db.from("game_ad_controls").select("scope, target_id, state, reason, comment").eq("game_id", game.id),
    db.from("game_category_blocks").select("category, blocked").eq("game_id", game.id),
  ]);
  if (controls.error) {
    if (isSchemaOutdated(controls.error)) warnSchemaOutdated("GET /v1/manifest", "0023_game_ad_controls.sql");
    else logDbError("manifest controls", controls.error);
    return null;
  }
  if (categories.error) {
    logDbError("manifest category blocks", categories.error);
    return null;
  }
  return { controlRows: controls.data, categoryRows: categories.data };
}

/** The pauses and blocks ready for mayServe(): { controls, blocked, campaignOf }. Null when any part could not be read. */
function buildControls(tables, bookings) {
  if (!tables || !bookings) return null;
  return {
    controls: controlMap(tables.controlRows),
    blocked: blockedCategories(tables.categoryRows),
    campaignOf: new Map(bookings.map((booking) => [booking.assignment_id, booking.campaign_id])),
  };
}

/**
 * Which campaign each booked assignment belongs to: [{ assignment_id, campaign_id }]. Null when it cannot be
 * read (a read failure must not hide ads; the manifest is asked again at the next start).
 */
async function loadBookings(db, rows) {
  const assignmentIds = [...new Set(rows.filter(isBooked).map((item) => item.assignmentId).filter(Boolean))];
  if (!assignmentIds.length) return [];

  const { data, error } = await db.from("bookings").select("assignment_id, campaign_id").in("assignment_id", assignmentIds);
  if (error) {
    logDbError("manifest bookings", error);
    return null;
  }
  return data ?? [];
}

/** Ids of the advertisers among the rows whose account is suspended (suspended_at comes with migration 0015). */
async function loadSuspended(db, rows) {
  const owners = [...new Set(rows.map((item) => item.advertiserId).filter(Boolean))];
  if (!owners.length) return new Set();

  const { data, error } = await db.from("accounts").select("id").in("id", owners).not("suspended_at", "is", null);
  return error ? new Set() : new Set((data ?? []).map((account) => account.id));
}

/** A pause may end by itself on a day (resume_on, migration 0028); before that migration it lasts until it is lifted. */
async function loadCampaigns(db, campaignIds) {
  const result = await db.from("campaigns").select("id, targeting, paused_at, resume_on").in("id", campaignIds);
  if (result.error && isSchemaOutdated(result.error)) {
    return db.from("campaigns").select("id, targeting, paused_at").in("id", campaignIds);
  }
  return result;
}

/**
 * The rules of the campaigns behind the booked items (migration 0026): { ruleOf: Map(assignmentId -> rule), profile }.
 * `bookings` are those of the items that can still be served. Null when there is nothing to check or the table is
 * missing; a read failure must not hide ads, and the manifest is asked again at the next start.
 */
async function loadCampaignRules(db, game, bookings, profileOf) {
  const campaignIds = [...new Set(bookings.map((booking) => booking.campaign_id))];
  if (!campaignIds.length) return null;

  const [campaignsResult, skippedResult] = await Promise.all([
    loadCampaigns(db, campaignIds),
    db.from("campaign_excluded_games").select("campaign_id").eq("game_id", game.id).in("campaign_id", campaignIds),
  ]);
  const { data: campaigns, error: campaignsError } = campaignsResult;
  if (campaignsError) {
    if (isSchemaOutdated(campaignsError)) warnSchemaOutdated("GET /v1/manifest", "0026_campaign_rules.sql");
    else logDbError("manifest campaigns", campaignsError);
    return null;
  }
  const { data: skipped, error: skippedError } = skippedResult;
  if (skippedError) {
    logDbError("manifest skipped games", skippedError);
    return null;
  }

  const skippedBy = new Set((skipped ?? []).map((row) => row.campaign_id));
  const ruleOfCampaign = new Map(
    (campaigns ?? []).map((campaign) => [
      campaign.id,
      { pausedAt: effectivePause(campaign.paused_at, campaign.resume_on), targeting: campaign.targeting ?? null, excluded: skippedBy.has(campaign.id) ? new Set([game.id]) : new Set() },
    ])
  );
  const ruleOf = new Map(bookings.map((booking) => [booking.assignment_id, ruleOfCampaign.get(booking.campaign_id)]));
  // The game's description is read only when some campaign has an audience.
  const profile = [...ruleOfCampaign.values()].some((rule) => rule.targeting != null) ? await profileOf() : null;
  return { ruleOf, profile };
}

/**
 * The developer's on/off switches for this game: { disabled, disabledScenes } (see
 * lib/placement-organization.js). Empty before migration 0021, and when they cannot be read:
 * a read failure must not hide a developer's ads, and the manifest is asked again at the next start.
 */
async function loadSwitches(db, game) {
  const none = { disabled: [], disabledScenes: [] };

  // Only placements that can matter: switched off themselves, in a folder, or too distorted to be shown (migration 0051).
  const readPlacements = (withShape) =>
    db
      .from("placements")
      .select(withShape ? "external_id, enabled, folder_id, removed_at, shape_blocked" : "external_id, enabled, folder_id, removed_at")
      .eq("game_id", game.id)
      .or(withShape ? "enabled.eq.false,folder_id.not.is.null,shape_blocked.eq.true" : "enabled.eq.false,folder_id.not.is.null");
  let { data: placements, error: placementsError } = await readPlacements(true);
  if (placementsError && isSchemaOutdated(placementsError)) {
    warnSchemaOutdated("GET /v1/manifest", "0051_placement_shape.sql");
    ({ data: placements, error: placementsError } = await readPlacements(false));
  }
  if (placementsError) {
    if (isSchemaOutdated(placementsError)) warnSchemaOutdated("GET /v1/manifest", "0021_placement_organization.sql");
    else logDbError("manifest switches", placementsError);
    return none;
  }

  const inFolders = (placements ?? []).some((placement) => placement.folder_id);
  let folders = [];
  if (inFolders) {
    const { data, error: foldersError } = await db
      .from("placement_folders")
      .select("id, enabled, parent_id")
      .eq("game_id", game.id);
    if (foldersError) {
      if (isSchemaOutdated(foldersError)) warnSchemaOutdated("GET /v1/manifest", "0021_placement_organization.sql");
      else logDbError("manifest folders", foldersError);
      return none;
    }
    folders = data ?? [];
  }

  const { data: offScenes, error: scenesError } = await db
    .from("placement_scene_off")
    .select("scene")
    .eq("game_id", game.id);
  if (scenesError) {
    if (isSchemaOutdated(scenesError)) warnSchemaOutdated("GET /v1/manifest", "0021_placement_organization.sql");
    else logDbError("manifest scenes", scenesError);
    return none;
  }

  return switchedOff({ placements: placements ?? [], folders, offScenes: offScenes ?? [] });
}

/**
 * What the developer said about this game: { genres, platforms, languages, countries }. Null when it could
 * not be read; creatives with an audience then do not show (failing closed is the safe side, and
 * the manifest is asked again at the next start).
 */
async function loadProfile(db, game) {
  let { data, error } = await db
    .from("games")
    .select("genres, platforms, languages, countries")
    .eq("id", game.id)
    .maybeSingle();
  // Before migration 0050 there is no countries column: read what the game does have.
  if (isSchemaOutdated(error)) {
    ({ data, error } = await db.from("games").select("genres, platforms, languages").eq("id", game.id).maybeSingle());
  }
  if (error) {
    if (isSchemaOutdated(error)) warnSchemaOutdated("GET /v1/manifest", "0018_targeting.sql");
    else logDbError("manifest game profile", error);
    return null;
  }
  return data ?? null;
}

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

/** The advertiser's own framing per ad shape of the booked creatives, by creative id. Empty before migration 0028. */
async function loadFormatCrops(db, rows) {
  const ids = [...new Set(rows.filter((item) => item.source === "booking").map((item) => item.creativeId))];
  const byCreative = new Map();
  if (!ids.length) return byCreative;
  const { data, error } = await db.from("creatives").select("id, format_crops").in("id", ids);
  if (error) return byCreative;
  for (const row of data ?? []) if (row.format_crops) byCreative.set(row.id, row.format_crops);
  return byCreative;
}

function activeAssignments(db, game, { skipRemoved, withCrop, withSource, withFormats, withTargeting }) {
  let query = db
    .from("assignments")
    .select(
      `
      id,
      ${withCrop ? "crop_zoom, crop_x, crop_y," : ""}
      ${withSource ? "source," : ""}
      placements!inner ( external_id${withFormats ? ", aspect_ratio" : ""} ),
      creatives!inner ( id, storage_path, status, owner_id${withSource ? ", ad_category" : ""}${withFormats ? ", width_px, height_px, safe_x, safe_y, safe_w, safe_h" : ""}${withTargeting ? ", targeting" : ""} )
    `
    )
    .eq("owner_id", game.owner_id)
    .eq("active", true)
    .eq("placements.game_id", game.id)
    .eq("creatives.status", "approved");

  if (skipRemoved) query = query.is("placements.removed_at", null);
  return query;
}
