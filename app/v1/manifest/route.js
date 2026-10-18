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
 * (the placement itself or its folder is off), `disabledScenes` holds scene names in which every
 * placement shows nothing. SDKs before 0.6 ignore both and keep their fallback texture there.
 */
export const GET = guarded(async function GET(request) {
  const { game, db, error } = await authenticateGame(request);
  if (error) return error;

  // Bookings that start or end today take effect before the manifest is built.
  await syncBookingSchedule(db);

  // Newest schema first; each step back drops what a missing migration added.
  const attempts = [
    { skipRemoved: true, withCrop: true, withSource: true, withFormats: true, withTargeting: true },
    { skipRemoved: true, withCrop: true, withSource: true, withFormats: true, migration: "0018_targeting.sql" },
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
    assignmentId: row.id,
    category: row.creatives.ad_category ?? null,
    row,
  }));

  // A booked creative may ask for a kind of game (migration 0018): genres, platforms, languages.
  // Those that do not fit this game are dropped before the rotation, so the placement shows
  // another advertiser or the developer's own creative. The game's own description is read only
  // when some booked creative has an audience; a game that has not filled in what a creative
  // asks for does not get it (strict).
  const targeted = rows.some((item) => item.source === "booking" && item.row.creatives.targeting != null);
  const eligible = targeted ? eligibleRows(rows, await loadProfile(db, game)) : rows;

  // Which picture each booked creative shows on each placement (migration 0017).
  // Where no picture fits the placement's shape the pair is dropped before the
  // rotation, so the placement shows another advertiser or the developer's own creative.
  const assetsOf = await loadAssets(db, eligible);
  const cropsOf = await loadFormatCrops(db, eligible);
  const { servable, shown } = choosePictures(eligible, assetsOf, (path) => creativeUrl(db, path), cropsOf);
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
  // What the developer switched off shows nothing: dropped before the rotation, and named in the reply.
  const off = await loadSwitches(db, game);
  const disabled = new Set(off.disabled);

  // What the developer paused or blocked in this game (migration 0023) is dropped the same way.
  const controls = await loadControls(db, game, servable);
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

  // What the campaigns themselves decide (migration 0026): paused, their own audience, games they skip.
  const campaignRules = await loadCampaignRules(db, game, servable);
  const campaignAllows = (item) => item.source !== "booking" || !campaignRules || campaignMayServe(campaignRules.ruleOf.get(item.assignmentId), game.id, campaignRules.profile);

  // The same steps one at a time, so a placement left empty can be explained (migration 0037).
  const notSuspended = servable.filter((item) => !suspended.has(item.advertiserId));
  const notBlocked = notSuspended.filter((item) => !disabled.has(item.placementId) && allowed(item));
  const chosen = rotate(notBlocked.filter(campaignAllows));
  const placements = chosen.map(({ row }) => ({
    id: row.placements.external_id,
    creativeId: row.creatives.id,
    imageUrl: shown.get(row).imageUrl,
    crop: shown.get(row).crop,
  }));

  await recordFill(db, game, { levels: [rows, eligible, servable, notSuspended, notBlocked], chosen, disabled });

  return json({ version: 1, placements, disabled: off.disabled, disabledScenes: off.disabledScenes });
});

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
 * Pauses and blocks the developer set in this game (migration 0023): { controls, blocked, campaignOf },
 * ready for mayServe(). Null when nothing needs checking, or when they cannot be read: a read failure
 * must not hide a developer's ads, and the manifest is asked again at the next start.
 */
async function loadControls(db, game, items) {
  const booked = items.filter((item) => item.source === "booking");
  if (!booked.length) return null;

  const { data: rows, error: controlsError } = await db
    .from("game_ad_controls")
    .select("scope, target_id, state, reason, comment")
    .eq("game_id", game.id);
  if (controlsError) {
    if (isSchemaOutdated(controlsError)) warnSchemaOutdated("GET /v1/manifest", "0023_game_ad_controls.sql");
    else logDbError("manifest controls", controlsError);
    return null;
  }

  const { data: categoryRows, error: categoriesError } = await db
    .from("game_category_blocks")
    .select("category, blocked")
    .eq("game_id", game.id);
  if (categoriesError) {
    logDbError("manifest category blocks", categoriesError);
    return null;
  }

  const assignmentIds = [...new Set(booked.map((item) => item.assignmentId).filter(Boolean))];
  const { data: bookings, error: bookingsError } = await db
    .from("bookings")
    .select("assignment_id, campaign_id")
    .in("assignment_id", assignmentIds);
  if (bookingsError) {
    logDbError("manifest bookings", bookingsError);
    return null;
  }

  return {
    controls: controlMap(rows),
    blocked: blockedCategories(categoryRows),
    campaignOf: new Map((bookings ?? []).map((booking) => [booking.assignment_id, booking.campaign_id])),
  };
}

/**
 * The rules of the campaigns behind the booked items (migration 0026): { ruleOf: Map(assignmentId -> rule), profile }.
 * Null when there is nothing to check or the table is missing; a read failure must not hide ads, and the manifest
 * is asked again at the next start.
 */
async function loadCampaignRules(db, game, items) {
  const assignmentIds = [...new Set(items.filter((item) => item.source === "booking").map((item) => item.assignmentId).filter(Boolean))];
  if (!assignmentIds.length) return null;

  const { data: bookings, error: bookingsError } = await db.from("bookings").select("assignment_id, campaign_id").in("assignment_id", assignmentIds);
  if (bookingsError) {
    logDbError("manifest campaign bookings", bookingsError);
    return null;
  }
  const campaignIds = [...new Set((bookings ?? []).map((booking) => booking.campaign_id))];
  if (!campaignIds.length) return null;

  // A pause may end by itself on a day (resume_on, migration 0028); before that migration it lasts until it is lifted.
  let { data: campaigns, error: campaignsError } = await db.from("campaigns").select("id, targeting, paused_at, resume_on").in("id", campaignIds);
  if (campaignsError && isSchemaOutdated(campaignsError)) {
    ({ data: campaigns, error: campaignsError } = await db.from("campaigns").select("id, targeting, paused_at").in("id", campaignIds));
  }
  if (campaignsError) {
    if (isSchemaOutdated(campaignsError)) warnSchemaOutdated("GET /v1/manifest", "0026_campaign_rules.sql");
    else logDbError("manifest campaigns", campaignsError);
    return null;
  }
  const { data: skipped, error: skippedError } = await db.from("campaign_excluded_games").select("campaign_id").eq("game_id", game.id).in("campaign_id", campaignIds);
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
  const ruleOf = new Map((bookings ?? []).map((booking) => [booking.assignment_id, ruleOfCampaign.get(booking.campaign_id)]));
  // The game's description is read only when some campaign has an audience.
  const profile = [...ruleOfCampaign.values()].some((rule) => rule.targeting != null) ? await loadProfile(db, game) : null;
  return { ruleOf, profile };
}

/**
 * The developer's on/off switches for this game: { disabled, disabledScenes } (see
 * lib/placement-organization.js). Empty before migration 0021, and when they cannot be read:
 * a read failure must not hide a developer's ads, and the manifest is asked again at the next start.
 */
async function loadSwitches(db, game) {
  const none = { disabled: [], disabledScenes: [] };

  // Only placements that can matter: switched off themselves, or in a folder.
  const { data: placements, error: placementsError } = await db
    .from("placements")
    .select("external_id, enabled, folder_id, removed_at")
    .eq("game_id", game.id)
    .or("enabled.eq.false,folder_id.not.is.null");
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
 * What the developer said about this game: { genres, platforms, languages }. Null when it could
 * not be read; creatives with an audience then do not show (failing closed is the safe side, and
 * the manifest is asked again at the next start).
 */
async function loadProfile(db, game) {
  const { data, error } = await db
    .from("games")
    .select("genres, platforms, languages")
    .eq("id", game.id)
    .maybeSingle();
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
