import {
  authenticateGame,
  cleanInstallId,
  guarded,
  isSchemaOutdated,
  json,
  logDbError,
  preflight,
  warnSchemaOutdated,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

// WebGL builds send a preflight first: the key header is not a simple header.
export const OPTIONS = preflight;

const MAX_IMPRESSIONS = 1000;
const MAX_OPPORTUNITIES = 1000;
const MAX_COUNT = 10_000;

/**
 * POST /v1/events
 * Receives the impression batches the SDK sends during play and on quit.
 *
 * Body: { sessionId, installId?, sdkVersion,
 *         impressions: [ { eventId?, placementId, creativeId, timestamp, visibleSeconds,
 *                          distance?, screenFraction?, angle? } ],
 *         opportunities?: [ { eventId, placementId, creativeId, timestamp, count, scene?, path? } ] }
 *
 * From SDK 0.11 visibleSeconds is the whole length of the view and distance (metres), screenFraction (0 to 1)
 * and angle (degrees) are averages over it; opportunities are the times a banner with an ad came into view,
 * looked at long enough or not (several of them in one row, with a count). Needs migration 0035; without it
 * the three figures are dropped and the opportunities are ignored, the impressions still count.
 *
 * Every row is one view of one banner. SDK 0.4+ gives each view its own eventId
 * and resends the same eventId when an upload is retried, so a replayed batch is
 * ignored while a second real view counts. Older SDKs send no eventId and count
 * once per placement per session; for them the id is derived from exactly that,
 * which keeps their numbers as they were.
 */
export const POST = guarded(async function POST(request) {
  const { game, db, error } = await authenticateGame(request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  const installId = cleanInstallId(body?.installId);
  const incoming = Array.isArray(body?.impressions) ? body.impressions : null;

  if (!sessionId) return json({ error: "Missing sessionId." }, 400);
  if (!incoming) return json({ error: "Expected an 'impressions' array." }, 400);
  if (incoming.length > MAX_IMPRESSIONS) {
    return json({ error: `At most ${MAX_IMPRESSIONS} impressions per batch.` }, 413);
  }
  const seen = Array.isArray(body?.opportunities) ? body.opportunities.slice(0, MAX_OPPORTUNITIES) : [];
  if (incoming.length === 0 && seen.length === 0) return json({ accepted: 0, duplicates: 0 });

  // Map the SDK's own placement IDs to rows, so an unknown ID is dropped rather
  // than silently recorded against nothing.
  const externalIds = [
    ...new Set(
      [...incoming, ...seen]
        .map((item) => (typeof item?.placementId === "string" ? item.placementId : null))
        .filter(Boolean)
    ),
  ];

  const { data: placements, error: lookupError } = await db
    .from("placements")
    .select("id, external_id")
    .eq("game_id", game.id)
    .in("external_id", externalIds);

  if (lookupError) {
    logDbError("impressions placement lookup", lookupError);
    return json({ error: "Could not record the impressions." }, 500);
  }

  const byExternalId = new Map((placements ?? []).map((p) => [p.external_id, p.id]));
  const placeIds = await loadPlaceIds(db, game, [...byExternalId.values()], [...incoming, ...seen]);

  // Chances to be seen first: if they cannot be stored the whole batch is sent again, and nothing is counted twice.
  let opportunitiesAccepted = 0;
  if (seen.length > 0) {
    const stored = await storeOpportunities({ db, game, sessionId, installId, seen, byExternalId, placeIds });
    if (stored.failed) return json({ error: "Could not record the impressions." }, 500);
    opportunitiesAccepted = stored.accepted;
  }

  const rows = [];
  let unknown = 0;

  for (const item of incoming) {
    const placementId = byExternalId.get(item?.placementId);
    if (!placementId) {
      unknown += 1;
      continue;
    }

    const row = {
      event_id: eventIdFor(item, sessionId),
      game_id: game.id,
      owner_id: game.owner_id,
      placement_id: placementId,
      creative_id: isUuid(item?.creativeId) ? item.creativeId : null,
      session_id: sessionId,
      sdk_version: typeof body.sdkVersion === "string" ? body.sdkVersion : null,
      visible_seconds: visibleSecondsFrom(item?.visibleSeconds),
      occurred_at: unixToIso(item?.timestamp),
    };
    // The anonymous install ID (SDK 0.9+) counts unique players; it needs migration 0032. Like the
    // place, it is only set when there is one, so a database without the column still takes the batch.
    if (installId) row.install_id = installId;
    // How the view was seen (SDK 0.11+, migration 0035). Left out when the SDK sent none.
    Object.assign(row, attentionFrom(item));
    // Only set when the place is known, which needs migration 0021: a database without the
    // column must not make the whole batch fall back to the old way of storing views.
    const placeId = placeIds.get(placeKey(placementId, item?.scene, item?.path));
    if (placeId) row.place_id = placeId;
    rows.push(row);
  }

  if (rows.length === 0) {
    return json({ accepted: 0, duplicates: 0, unknownPlacements: unknown, opportunities: opportunitiesAccepted });
  }

  // Views of the developer's own creatives are marked, so the dashboard can count them apart
  // from advertisers' views (migration 0020). Before it, nothing is marked.
  const creativeIds = [...new Set(rows.map((row) => row.creative_id).filter(Boolean))];
  if (creativeIds.length > 0) {
    const { data: ownRows, error: ownError } = await db
      .from("creatives")
      .select("id")
      .in("id", creativeIds)
      .eq("kind", "own");
    if (!ownError) {
      const ownIds = new Set((ownRows ?? []).map((row) => row.id));
      for (const row of rows) row.own = ownIds.has(row.creative_id);
    } else if (isSchemaOutdated(ownError)) {
      warnSchemaOutdated("POST /v1/events", "0020_own_creatives.sql");
    } else {
      logDbError("impressions own lookup", ownError);
    }
  }

  // ignoreDuplicates leans on the impressions_event_unique index (migration 0002).
  let { data, error: insertError } = await db
    .from("impressions")
    .upsert(rows, { onConflict: "game_id,event_id", ignoreDuplicates: true })
    .select("id");

  if (insertError && isSchemaOutdated(insertError) && rows.some((row) => "view_distance" in row)) {
    // 0035 not applied yet: keep everything but how the view was seen.
    warnSchemaOutdated("POST /v1/events", "0035_visibility_attention.sql");
    for (const row of rows) {
      delete row.view_distance;
      delete row.screen_fraction;
      delete row.view_angle;
    }
    ({ data, error: insertError } = await db
      .from("impressions")
      .upsert(rows, { onConflict: "game_id,event_id", ignoreDuplicates: true })
      .select("id"));
  }

  if (insertError && isSchemaOutdated(insertError) && installId) {
    // 0032 not applied yet: keep everything but the install ID.
    warnSchemaOutdated("POST /v1/events", "0032_unique_players.sql");
    ({ data, error: insertError } = await db
      .from("impressions")
      .upsert(
        rows.map(({ install_id, ...rest }) => rest),
        { onConflict: "game_id,event_id", ignoreDuplicates: true }
      )
      .select("id"));
  }

  if (insertError && isSchemaOutdated(insertError)) {
    // Database not migrated yet: store as before, one row per placement per session.
    warnSchemaOutdated("POST /v1/events");
    ({ data, error: insertError } = await db
      .from("impressions")
      .upsert(
        rows.map(({ event_id, own, place_id, install_id, ...rest }) => rest),
        { onConflict: "game_id,session_id,placement_id,creative_id", ignoreDuplicates: true }
      )
      .select("id"));
  }

  if (insertError) {
    logDbError("impressions insert", insertError);
    return json({ error: "Could not record the impressions." }, 500);
  }

  const accepted = data?.length ?? 0;
  return json({
    accepted,
    duplicates: rows.length - accepted,
    unknownPlacements: unknown,
    opportunities: opportunitiesAccepted,
  });
});

/**
 * How a view was seen, as the columns of migration 0035: average distance (m), share of the screen (0 to 1)
 * and angle off head-on (degrees). Empty when the SDK sent no distance (before 0.11), so an old view is never
 * mistaken for a measured one. Values out of range are pulled in rather than failing the batch.
 */
function attentionFrom(item) {
  const distance = Number(item?.distance);
  if (!Number.isFinite(distance) || distance <= 0) return {};
  const fraction = Number(item?.screenFraction);
  const angle = Number(item?.angle);
  return {
    view_distance: Math.round(Math.min(distance, 99_999) * 100) / 100,
    screen_fraction: Number.isFinite(fraction) ? Math.round(Math.min(Math.max(fraction, 0), 1) * 10_000) / 10_000 : null,
    view_angle: Number.isFinite(angle) ? Math.round(Math.min(Math.max(angle, 0), 180) * 10) / 10 : null,
  };
}

/**
 * Stores the chances to be seen (migration 0035). Returns { accepted } or { failed: true } when the database
 * errs, so the SDK sends the batch again. A database without the table is not an error: they are ignored.
 */
async function storeOpportunities({ db, game, sessionId, installId, seen, byExternalId, placeIds }) {
  const rows = [];
  for (const item of seen) {
    const placementId = byExternalId.get(item?.placementId);
    const eventId = typeof item?.eventId === "string" ? item.eventId.trim() : "";
    const count = Math.floor(Number(item?.count));
    if (!placementId || !eventId || eventId.length > 64 || !Number.isFinite(count) || count < 1) continue;
    const row = {
      event_id: eventId,
      game_id: game.id,
      owner_id: game.owner_id,
      placement_id: placementId,
      creative_id: isUuid(item?.creativeId) ? item.creativeId : null,
      session_id: sessionId,
      opportunities: Math.min(count, MAX_COUNT),
      own: false,
      occurred_at: unixToIso(item?.timestamp),
    };
    if (installId) row.install_id = installId;
    const placeId = placeIds.get(placeKey(placementId, item?.scene, item?.path));
    if (placeId) row.place_id = placeId;
    rows.push(row);
  }
  if (rows.length === 0) return { accepted: 0 };

  const creativeIds = [...new Set(rows.map((row) => row.creative_id).filter(Boolean))];
  if (creativeIds.length > 0) {
    const { data: ownRows, error: ownError } = await db.from("creatives").select("id").in("id", creativeIds).eq("kind", "own");
    if (!ownError) {
      const ownIds = new Set((ownRows ?? []).map((row) => row.id));
      for (const row of rows) row.own = ownIds.has(row.creative_id);
    } else if (!isSchemaOutdated(ownError)) {
      logDbError("opportunities own lookup", ownError);
    }
  }

  const { data, error } = await db
    .from("ad_opportunities")
    .upsert(rows, { onConflict: "game_id,event_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    if (isSchemaOutdated(error)) {
      warnSchemaOutdated("POST /v1/events", "0035_visibility_attention.sql");
      return { accepted: 0 };
    }
    logDbError("opportunities insert", error);
    return { failed: true };
  }
  return { accepted: data?.length ?? 0 };
}

function placeKey(placementId, scene, path) {
  return `${placementId}\u0000${typeof scene === "string" ? scene : ""}\u0000${typeof path === "string" ? path : ""}`;
}

/**
 * Which place each impression came from (migration 0021): the SDK 0.6+ sends the scene and the
 * path of the copy that was seen. Returns a map of placeKey -> place id. Empty when no impression
 * names a place, or before the migration: the views are then counted per placement only.
 */
async function loadPlaceIds(db, game, placementIds, incoming) {
  const named = incoming.some((item) => typeof item?.scene === "string" || typeof item?.path === "string");
  const byKey = new Map();
  if (!named || placementIds.length === 0) return byKey;

  const { data, error } = await db
    .from("placement_places")
    .select("id, placement_id, scene, path")
    .eq("game_id", game.id)
    .in("placement_id", placementIds);

  if (error) {
    if (isSchemaOutdated(error)) warnSchemaOutdated("POST /v1/events", "0021_placement_organization.sql");
    else logDbError("impressions place lookup", error);
    return byKey;
  }
  for (const place of data ?? []) byKey.set(placeKey(place.placement_id, place.scene, place.path), place.id);
  return byKey;
}

function eventIdFor(item, sessionId) {
  const id = typeof item?.eventId === "string" ? item.eventId.trim() : "";
  if (id && id.length <= 64) return id;
  return `${sessionId}:${item?.placementId ?? ""}:${item?.creativeId ?? ""}`.slice(0, 200);
}

// The column is numeric(6,2). One out-of-range value from a buggy or hostile
// client would fail the whole batch with a 500 and lose every other view in it.
const MAX_VISIBLE_SECONDS = 9999.99;

function visibleSecondsFrom(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return Math.round(Math.min(Math.max(seconds, 0), MAX_VISIBLE_SECONDS) * 100) / 100;
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function unixToIso(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}
