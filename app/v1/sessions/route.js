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

const WEEK_SECONDS = 7 * 86_400;
const HOUR_SECONDS = 3_600;

/**
 * POST /v1/sessions
 * The SDK (0.10+) announces each play session once, when it begins, whether or not an ad is ever seen in it.
 * The dashboard counts impressions per session over these, so a session without an ad weighs in too.
 *
 * Body: { sessionId, installId?, sdkVersion?, startedAt? }   (startedAt: Unix seconds, UTC)
 *
 * Announcing the same session again changes nothing, so a retry is harmless. Needs migration 0033; before it
 * the route answers 200 and stores nothing, so an SDK that is ahead of the database does not loop on errors.
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

  // The same text the impressions of this session carry, or the two cannot be matched up.
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) {
    return json({ error: "Missing or invalid sessionId." }, 400);
  }

  const row = {
    game_id: game.id,
    owner_id: game.owner_id,
    session_id: sessionId,
    sdk_version: typeof body?.sdkVersion === "string" ? body.sdkVersion.slice(0, 32) : null,
    started_at: startedAtFrom(body?.startedAt),
  };
  const installId = cleanInstallId(body?.installId);
  if (installId) row.install_id = installId;

  const { data, error: insertError } = await db
    .from("game_sessions")
    .upsert(row, { onConflict: "game_id,session_id", ignoreDuplicates: true })
    .select("session_id");

  if (insertError) {
    if (isSchemaOutdated(insertError)) {
      warnSchemaOutdated("POST /v1/sessions", "0033_session_starts.sql");
      return json({ accepted: 0, duplicates: 0 });
    }
    logDbError("session start insert", insertError);
    return json({ error: "Could not record the session." }, 500);
  }

  const accepted = data?.length ?? 0;
  return json({ accepted, duplicates: 1 - accepted });
});

/** When the session began. A clock far in the past or the future is a wrong clock: use the time of the request. */
function startedAtFrom(value) {
  const seconds = Number(value);
  const now = Date.now() / 1000;
  if (!Number.isFinite(seconds) || seconds < now - WEEK_SECONDS || seconds > now + HOUR_SECONDS) {
    return new Date().toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}
