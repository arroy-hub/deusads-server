import { authenticateGame, guarded, json } from "../../../lib/api";

export const dynamic = "force-dynamic";

const MAX_PLACEMENTS = 500;

/**
 * POST /v1/placements
 * Sent from the Unity editor when the developer presses "Send placements".
 * This is what removes typing from the developer's job: the SDK generates the
 * IDs and reports size and proportions, and the dashboard names them afterwards.
 *
 * Body: { placements: [ { externalId, label?, scene?, aspectRatio?, widthM?, heightM? } ] }
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

  const incoming = Array.isArray(body?.placements) ? body.placements : null;
  if (!incoming) {
    return json({ error: "Expected a 'placements' array." }, 400);
  }
  if (incoming.length > MAX_PLACEMENTS) {
    return json(
      { error: `A game may report at most ${MAX_PLACEMENTS} placements at once.` },
      413
    );
  }

  const now = new Date().toISOString();
  const rows = [];

  for (const item of incoming) {
    const externalId = typeof item?.externalId === "string" ? item.externalId.trim() : "";
    if (!externalId) continue;

    rows.push({
      game_id: game.id,
      owner_id: game.owner_id,
      external_id: externalId,
      label: typeof item.label === "string" ? item.label.slice(0, 120) : null,
      scene: typeof item.scene === "string" ? item.scene.slice(0, 200) : null,
      aspect_ratio: finiteOrNull(item.aspectRatio),
      width_m: finiteOrNull(item.widthM),
      height_m: finiteOrNull(item.heightM),
      last_seen_at: now,
    });
  }

  if (rows.length === 0) {
    return json({ error: "No placements had a usable externalId." }, 400);
  }

  // Re-sending is normal: the developer presses the button after every change.
  // Existing rows are refreshed rather than duplicated, and last_seen_at lets the
  // dashboard show which banners are still in the current build.
  const { data, error: upsertError } = await db
    .from("placements")
    .upsert(rows, { onConflict: "game_id,external_id" })
    .select("external_id");

  if (upsertError) {
    return json({ error: "Could not save the placements." }, 503);
  }

  return json({ game: game.name, saved: data.length });
});

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
