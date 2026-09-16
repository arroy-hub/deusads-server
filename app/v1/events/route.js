import {
  authenticateGame,
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

/**
 * POST /v1/events
 * Receives the impression batches the SDK sends during play and on quit.
 *
 * Body: { sessionId, sdkVersion,
 *         impressions: [ { eventId?, placementId, creativeId, timestamp, visibleSeconds } ] }
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
  const incoming = Array.isArray(body?.impressions) ? body.impressions : null;

  if (!sessionId) return json({ error: "Missing sessionId." }, 400);
  if (!incoming) return json({ error: "Expected an 'impressions' array." }, 400);
  if (incoming.length > MAX_IMPRESSIONS) {
    return json({ error: `At most ${MAX_IMPRESSIONS} impressions per batch.` }, 413);
  }
  if (incoming.length === 0) return json({ accepted: 0, duplicates: 0 });

  // Map the SDK's own placement IDs to rows, so an unknown ID is dropped rather
  // than silently recorded against nothing.
  const externalIds = [
    ...new Set(
      incoming
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
  const rows = [];
  let unknown = 0;

  for (const item of incoming) {
    const placementId = byExternalId.get(item?.placementId);
    if (!placementId) {
      unknown += 1;
      continue;
    }

    rows.push({
      event_id: eventIdFor(item, sessionId),
      game_id: game.id,
      owner_id: game.owner_id,
      placement_id: placementId,
      creative_id: isUuid(item?.creativeId) ? item.creativeId : null,
      session_id: sessionId,
      sdk_version: typeof body.sdkVersion === "string" ? body.sdkVersion : null,
      visible_seconds: Number.isFinite(Number(item?.visibleSeconds))
        ? Number(item.visibleSeconds)
        : null,
      occurred_at: unixToIso(item?.timestamp),
    });
  }

  if (rows.length === 0) {
    return json({ accepted: 0, duplicates: 0, unknownPlacements: unknown });
  }

  // ignoreDuplicates leans on the impressions_event_unique index (migration 0002).
  let { data, error: insertError } = await db
    .from("impressions")
    .upsert(rows, { onConflict: "game_id,event_id", ignoreDuplicates: true })
    .select("id");

  if (insertError && isSchemaOutdated(insertError)) {
    // Database not migrated yet: store as before, one row per placement per session.
    warnSchemaOutdated("POST /v1/events");
    ({ data, error: insertError } = await db
      .from("impressions")
      .upsert(
        rows.map(({ event_id, ...rest }) => rest),
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
  });
});

function eventIdFor(item, sessionId) {
  const id = typeof item?.eventId === "string" ? item.eventId.trim() : "";
  if (id && id.length <= 64) return id;
  return `${sessionId}:${item?.placementId ?? ""}:${item?.creativeId ?? ""}`.slice(0, 200);
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
