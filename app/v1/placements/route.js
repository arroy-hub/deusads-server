import {
  authenticateGame,
  guarded,
  isSchemaOutdated,
  json,
  logDbError,
  warnSchemaOutdated,
} from "../../../lib/api";
import { placesOf, suggestPlaceType } from "../../../lib/placement-organization";

export const dynamic = "force-dynamic";

const MAX_PLACEMENTS = 500;
const MAX_PLACES_PER_PLACEMENT = 200;
const MAX_PLACES_TOTAL = 5000;

/**
 * POST /v1/placements
 * Sent from the Unity editor when the developer presses "Send placements".
 * The SDK generates the IDs and reports size and proportions; the dashboard
 * names them afterwards.
 *
 * Body: {
 *   complete?: boolean,
 *   placements: [ { externalId, label?, scene?, aspectRatio?, widthM?, heightM?,
 *                   shared?, places?: [ { scene, path } ] } ]
 * }
 *
 * SDK 0.6+ lists every copy of a shared placement (copies of one prefab, one ID) once, under
 * `places`: where each copy stands (scene and path in the hierarchy). `shared: false` marks a
 * placement with an ID of its own. Older SDKs send only `scene`.
 * Places that are missing from a complete list are marked removed, like placements.
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
  const placesByExternalId = new Map();
  let placeCount = 0;

  for (const item of incoming) {
    const externalId = typeof item?.externalId === "string" ? item.externalId.trim() : "";
    if (!externalId) continue;

    if (seen.has(externalId)) {
      duplicates.add(externalId);
      continue;
    }
    seen.add(externalId);

    const places = placesOf(item).slice(0, MAX_PLACES_PER_PLACEMENT);
    placeCount += places.length;
    placesByExternalId.set(externalId, places);

    rows.push({
      game_id: game.id,
      owner_id: game.owner_id,
      external_id: externalId,
      label: typeof item.label === "string" ? item.label.slice(0, 120) : null,
      // The first place keeps the old single-scene field filled for everything that still reads it.
      scene:
        typeof item.scene === "string"
          ? item.scene.slice(0, 200)
          : places[0]?.scene
            ? places[0].scene
            : null,
      aspect_ratio: finiteOrNull(item.aspectRatio),
      width_m: finiteOrNull(item.widthM),
      height_m: finiteOrNull(item.heightM),
      last_seen_at: now,
      removed_at: null,
      // Migration 0021. Left out of the save while the database does not have it.
      shared: item.shared !== false,
      place_type_suggested: firstSuggestion(places, item.scene),
    });
  }

  if (placeCount > MAX_PLACES_TOTAL) {
    return json({ error: `A game may report at most ${MAX_PLACES_TOTAL} places at once.` }, 413);
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
      .select("id, external_id, label, removed_at")
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
  let organized = false; // true once migration 0021 is known to be there
  const idOf = new Map();
  if (rows.length > 0) {
    // Newest schema first; each step back drops what a missing migration added.
    const withoutRemoved = (list) => list.map(({ removed_at, ...rest }) => rest);
    const withoutOrganization = (list) => list.map(({ shared, place_type_suggested, ...rest }) => rest);
    const attempts = [
      { payload: schemaCurrent ? rows : withoutRemoved(rows), organized: true },
      {
        payload: withoutOrganization(schemaCurrent ? rows : withoutRemoved(rows)),
        organized: false,
      },
    ];

    let data;
    let upsertError;
    for (const attempt of attempts) {
      ({ data, error: upsertError } = await db
        .from("placements")
        .upsert(attempt.payload, { onConflict: "game_id,external_id" })
        .select("id, external_id"));
      if (!isSchemaOutdated(upsertError)) {
        organized = attempt.organized;
        break;
      }
      if (attempt.organized) warnSchemaOutdated("POST /v1/placements", "0021_placement_organization.sql");
    }

    if (upsertError) {
      logDbError("placements upsert", upsertError);
      if (upsertError.code === "21000") {
        return json({ error: "Several placements share the same ID." }, 409);
      }
      return json({ error: "Could not save the placements." }, 500);
    }
    saved = data?.length ?? 0;
    for (const row of data ?? []) idOf.set(row.external_id, row.id);
  }

  // Where each placement stands (migration 0021).
  let placesSaved = 0;
  if (organized) {
    const placeRows = [];
    for (const [externalId, list] of placesByExternalId) {
      const placementId = idOf.get(externalId);
      if (!placementId) continue;
      for (const place of list) {
        placeRows.push({
          placement_id: placementId,
          game_id: game.id,
          owner_id: game.owner_id,
          scene: place.scene,
          path: place.path,
          last_seen_at: now,
          removed_at: null,
        });
      }
    }
    if (placeRows.length > 0) {
      const { error: placesError } = await db
        .from("placement_places")
        .upsert(placeRows, { onConflict: "placement_id,scene,path" });
      if (placesError && isSchemaOutdated(placesError)) {
        organized = false;
        warnSchemaOutdated("POST /v1/placements", "0021_placement_organization.sql");
      } else if (placesError) {
        logDbError("placement places upsert", placesError);
        return json({ error: "Saved the placements but could not save where they stand.", saved }, 500);
      } else {
        placesSaved = placeRows.length;
      }
    }
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

    // Places that are no longer in the game: copies missing from a placement that reported places,
    // and every place of a placement that is gone.
    if (organized) {
      const goneIds = new Set(gone.map((row) => row.id));
      const reportedKeys = new Set();
      const reportingIds = new Set();
      for (const [externalId, list] of placesByExternalId) {
        const placementId = idOf.get(externalId);
        if (!placementId || list.length === 0) continue;
        reportingIds.add(placementId);
        for (const place of list) reportedKeys.add(placeKey(placementId, place.scene, place.path));
      }

      const { data: known, error: knownError } = await db
        .from("placement_places")
        .select("id, placement_id, scene, path")
        .eq("game_id", game.id)
        .is("removed_at", null);

      if (knownError) {
        if (isSchemaOutdated(knownError)) warnSchemaOutdated("POST /v1/placements", "0021_placement_organization.sql");
        else logDbError("placement places read", knownError);
      } else {
        const stale = (known ?? [])
          .filter(
            (place) =>
              goneIds.has(place.placement_id) ||
              (reportingIds.has(place.placement_id) &&
                !reportedKeys.has(placeKey(place.placement_id, place.scene, place.path)))
          )
          .map((place) => place.id);

        for (let start = 0; start < stale.length; start += 100) {
          const { error: staleError } = await db
            .from("placement_places")
            .update({ removed_at: now })
            .in("id", stale.slice(start, start + 100));
          if (staleError) {
            logDbError("placement places remove", staleError);
            break;
          }
        }
      }
    }
  }

  return json({
    game: game.name,
    saved,
    ...(organized ? { places: placesSaved } : {}),
    removed,
    restored,
    ...(complete && !schemaCurrent
      ? { warning: "Removed placements are not synced until the server database is migrated." }
      : {}),
  });
});

function placeKey(placementId, scene, path) {
  return `${placementId}\u0000${scene}\u0000${path}`;
}

/** The first place (or the old single scene) whose scene and path suggest a kind of spot. */
function firstSuggestion(places, legacyScene) {
  for (const place of places) {
    const type = suggestPlaceType(place.scene, place.path);
    if (type) return type;
  }
  return suggestPlaceType(typeof legacyScene === "string" ? legacyScene : "", "");
}

function toSummary(row) {
  return { externalId: row.external_id, label: row.label };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
