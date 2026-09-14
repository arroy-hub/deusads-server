import { authenticateGame, guarded, json } from "../../../lib/api";

export const dynamic = "force-dynamic";

const MAX_IMPRESSIONS = 1000;

/**
 * POST /v1/events
 * Receives the impression batches the SDK sends during play and on quit.
 *
 * Body: { sessionId, sdkVersion, impressions: [ { placementId, creativeId, timestamp, visibleSeconds } ] }
 *
 * The SDK already counts one impression per placement per session, so a repeat
 * arriving here is a retry or a replayed batch. Those are ignored rather than
 * counted twice: an inflated number would be found by the first advertiser who
 * checks, and that is not a mistake worth risking.
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
    return json({ error: "Could not record the impressions." }, 503);
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

  // ignoreDuplicates leans on the impressions_dedupe unique index.
  const { data, error: insertError } = await db
    .from("impressions")
    .upsert(rows, {
      onConflict: "game_id,session_id,placement_id,creative_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    return json({ error: "Could not record the impressions." }, 503);
  }

  const accepted = data?.length ?? 0;
  return json({
    accepted,
    duplicates: rows.length - accepted,
    unknownPlacements: unknown,
  });
});

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
