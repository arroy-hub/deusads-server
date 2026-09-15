import {
  authenticateGame,
  guarded,
  isSchemaOutdated,
  json,
  logDbError,
  warnSchemaOutdated,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

const MAX_PLACEMENTS = 500;

/**
 * POST /v1/placements
 * Sent from the Unity editor when the developer presses "Send placements".
 * The SDK generates the IDs and reports size and proportions; the dashboard
 * names them afterwards.
 *
 * Body: {
 *   complete?: boolean,
 *   placements: [ { externalId, label?, scene?, aspectRatio?, widthM?, heightM? } ]
 * }
 *
 * complete: true (SDK 0.4+) means the list is every placement the game has.
 * Placements of this game that are missing from it are marked removed and
 * disappear from the dashboard and the manifest; sending one again restores it.
 * Without the flag (older SDKs, which only report open scenes) nothing is removed.
 *
 * Response: { game, saved, removed: [{ externalId, label }], restored: [...] }
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

  const complete = body?.complete === true;
  const now = new Date().toISOString();
  const rows = [];
  const seen = new Set();
  const duplicates = new Set();

  for (const item of incoming) {
    const externalId = typeof item?.externalId === "string" ? item.externalId.trim() : "";
    if (!externalId) continue;

    if (seen.has(externalId)) {
      duplicates.add(externalId);
      continue;
    }
    seen.add(externalId);

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
      removed_at: null,
    });
  }

  // Two banners claiming one ID is a bug on the game's side, and saving either
  // would hide it. Postgres would also reject the batch outright.
  if (duplicates.size > 0) {
    return json(
      {
        error:
          "Several placements share the same ID. Update the DeusADS SDK, or open the scenes " +
          "and prefabs that contain them so the editor gives each its own ID.",
        duplicates: [...duplicates],
      },
      409
    );
  }

  if (rows.length === 0 && !complete) {
    return json({ error: "No placements had a usable externalId." }, 400);
  }

  // State before the save, to report what gets removed or restored.
  let before = [];
  let schemaCurrent = true;
  {
    const { data, error: readError } = await db
      .from("placements")
      .select("external_id, label, removed_at")
      .eq("game_id", game.id);

    if (readError && isSchemaOutdated(readError)) {
      schemaCurrent = false;
      warnSchemaOutdated("POST /v1/placements");
    } else if (readError) {
      logDbError("placements read", readError);
      return json({ error: "Could not read the game's placements." }, 500);
    } else {
      before = data ?? [];
    }
  }

  let saved = 0;
  if (rows.length > 0) {
    const payload = schemaCurrent ? rows : rows.map(({ removed_at, ...rest }) => rest);
    const { data, error: upsertError } = await db
      .from("placements")
      .upsert(payload, { onConflict: "game_id,external_id" })
      .select("external_id");

    if (upsertError) {
      logDbError("placements upsert", upsertError);
      if (upsertError.code === "21000") {
        return json({ error: "Several placements share the same ID." }, 409);
      }
      return json({ error: "Could not save the placements." }, 500);
    }
    saved = data?.length ?? 0;
  }

  const restored = before
    .filter((row) => row.removed_at && seen.has(row.external_id))
    .map(toSummary);

  let removed = [];
  if (complete && schemaCurrent) {
    const gone = before.filter((row) => !row.removed_at && !seen.has(row.external_id));

    if (gone.length > 0) {
      const { error: removeError } = await db
        .from("placements")
        .update({ removed_at: now })
        .eq("game_id", game.id)
        .in(
          "external_id",
          gone.map((row) => row.external_id)
        );

      if (removeError) {
        logDbError("placements remove", removeError);
        return json(
          {
            error: "Saved the placements but could not remove the ones no longer in the game.",
            saved,
          },
          500
        );
      }
      removed = gone.map(toSummary);
    }
  }

  return json({
    game: game.name,
    saved,
    removed,
    restored,
    ...(complete && !schemaCurrent
      ? { warning: "Removed placements are not synced until the server database is migrated." }
      : {}),
  });
});

function toSummary(row) {
  return { externalId: row.external_id, label: row.label };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
