"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { syncAllCampaigns } from "../../lib/campaign-sync";
import { userClient } from "../../lib/supabase-server";
import { isSchemaOutdated, serviceClient } from "../../lib/api";
import { isCategory } from "../../lib/categories";
import { normalizeCrop } from "../../lib/surface-math";
import { MAX_OWN_CREATIVES, OWN_PICTURE_TYPES } from "../../lib/own-creatives";
import { validateProfile } from "../../lib/targeting";

// Every action writes through the user's own client, so row-level security is
// what actually enforces ownership. The owner_id below is convenience, not the
// security boundary: a forged value is rejected by the database.

const MAX_BYTES = 8 * 1024 * 1024;

/** After a game changes what it is or opens a placement, campaigns started by audience pick up what now fits. Runs after the response. */
function resyncCampaigns() {
  after(async () => {
    try {
      await syncAllCampaigns(serviceClient());
    } catch {
      // the daily run catches up
    }
  });
}

/** One client and one auth round-trip per action. */
async function session() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  return { db, user: data?.user ?? null };
}

export async function createGame(formData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the game a name." };

  // What the game is: genres, platforms, languages (migration 0018). Advertisers aim ads at these.
  const described = validateProfile({
    genres: formData.getAll("genres"),
    platforms: formData.getAll("platforms"),
    languages: formData.getAll("languages"),
  });
  if (described.error) return { error: described.error };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  let { error } = await db.from("games").insert({ owner_id: user.id, name, ...described.value });
  // Migration 0018 not applied yet: the game is created without its description.
  if (isSchemaOutdated(error)) ({ error } = await db.from("games").insert({ owner_id: user.id, name }));

  if (error) return { error: "Could not create the game." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Saves the game's settings tab in one go: its name and, when the database knows them (migration
 * 0018), what the game is: genres, platforms and languages, at least one of each. Ads that ask for a
 * genre, platform or language only show in games that have said what they are. Owner only, enforced
 * by row-level security. Changes reach players the next time they start the game. Without `genres`
 * (an older database) only the name is saved.
 */
export async function saveGame({ gameId, name, genres, platforms, languages }) {
  const clean = String(name ?? "").trim().slice(0, MAX_NAME);
  if (!clean) return { error: "Give the game a name." };

  const withProfile = genres !== undefined;
  const described = withProfile ? validateProfile({ genres, platforms, languages }) : { value: {} };
  if (described.error) return { error: described.error };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data, error } = await db
    .from("games")
    .update({ name: clean, ...described.value })
    .eq("id", String(gameId ?? ""))
    .select("id")
    .maybeSingle();
  if (isSchemaOutdated(error)) return { error: NEEDS_TARGETING_MIGRATION };
  if (error || !data) return { error: "Could not save. Try again." };

  if (withProfile) resyncCampaigns();
  revalidatePath("/dashboard", "layout");
  return { ok: true, name: clean, value: withProfile ? described.value : null };
}

/**
 * Sets (or, with no path, clears) a game's icon. The browser has already put a small square picture
 * in Storage inside the user's own folder; this records where it is and deletes the previous one.
 * Owner only, enforced by row-level security (migration 0019 adds the column).
 */
export async function setGameIcon({ gameId, path }) {
  const id = String(gameId ?? "");
  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const next = path == null || path === "" ? null : String(path);
  if (next !== null && (!next.startsWith(`${user.id}/`) || next.includes("..") || next.length > 300)) {
    return { error: "Upload failed. Try again." };
  }

  const { data: before, error: readError } = await db.from("games").select("id, icon_path").eq("id", id).maybeSingle();
  if (isSchemaOutdated(readError)) return { error: "Game icons need the database update (migration 0019) first." };
  if (!before) {
    if (next) await db.storage.from("creatives").remove([next]);
    return { error: "That game no longer exists." };
  }

  const { error } = await db.from("games").update({ icon_path: next }).eq("id", id);
  if (error) {
    if (next) await db.storage.from("creatives").remove([next]);
    return { error: "Could not save the icon. Try again." };
  }
  if (before.icon_path && before.icon_path !== next && before.icon_path.startsWith(`${user.id}/`)) {
    const { error: removeError } = await db.storage.from("creatives").remove([before.icon_path]);
    if (removeError) console.warn("[DeusADS] old game icon not removed:", before.icon_path, removeError.message);
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Records a creative whose file the browser has already put in Storage.
 * The file never passes through this function, so its size is not bound by
 * the Server Action body limit.
 */
export async function registerCreative({ name, path, type, size, width, height, adCategory }) {
  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  // The browser chose the path; only accept one inside this user's folder.
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`) || path.includes("..")) {
    return { error: "Upload failed. Try again." };
  }
  if (!["image/png", "image/jpeg"].includes(type)) {
    return { error: "Creatives must be PNG or JPG." };
  }
  if (!(size > 0) || size > MAX_BYTES) {
    return { error: "Creatives must be under 8 MB." };
  }

  if (!isCategory(adCategory)) return { error: "Choose what the ad is for." };

  const cleanName = String(name ?? "").trim().slice(0, 120) || "Untitled creative";
  const px = (value) => (Number.isInteger(value) && value > 0 && value < 20000 ? value : null);

  const row = {
    owner_id: user.id,
    name: cleanName,
    storage_path: path,
    width_px: px(width),
    height_px: px(height),
  };
  let { data, error } = await db
    .from("creatives")
    .insert({ ...row, ad_category: adCategory })
    .select("id, name")
    .single();
  // Migration 0015 not applied yet: save without the category.
  if (isSchemaOutdated(error)) {
    ({ data, error } = await db.from("creatives").insert(row).select("id, name").single());
  }

  if (error) {
    // Do not leave an orphaned file behind.
    await db.storage.from("creatives").remove([path]);
    return { error: "Uploaded the image but could not save it." };
  }

  revalidatePath("/dashboard/creatives");
  return { ok: true, creative: data };
}

// ---------------------------------------------------------------- a developer's own creatives

const NEEDS_OWN_MIGRATION = "Run supabase/migrations/0020_own_creatives.sql in the Supabase SQL editor first.";

/**
 * Puts a picture of the developer's own on a placement. The browser has already uploaded the file to
 * Storage (inside this user's folder); this records it as an "own" creative and switches it on. Own
 * creatives show on the placement in turn whenever no advertiser is booked; there is no review.
 * Up to MAX_OWN_CREATIVES per placement.
 */
export async function addOwnCreative({ placementId, path, name, type, size, width, height }) {
  placementId = String(placementId ?? "");
  if (!placementId) return { error: "Unknown placement." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const cleanup = () => db.storage.from("creatives").remove([path]);
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`) || path.includes("..")) {
    return { error: "Upload failed. Try again." };
  }
  if (!OWN_PICTURE_TYPES[type]) {
    await cleanup();
    return { error: "Creatives must be PNG or JPG." };
  }
  if (!(size > 0) || size > MAX_BYTES) {
    await cleanup();
    return { error: "Creatives must be under 8 MB." };
  }

  // Row-level security only lets an owner see their own placements.
  const { data: placement } = await db.from("placements").select("id").eq("id", placementId).eq("owner_id", user.id).maybeSingle();
  if (!placement) {
    await cleanup();
    return { error: "Placement not found." };
  }

  const { count, error: countError } = await db
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("placement_id", placementId)
    .eq("source", "own");
  if (countError) {
    await cleanup();
    return { error: isSchemaOutdated(countError) ? NEEDS_OWN_MIGRATION : "Could not save. Try again." };
  }
  if ((count ?? 0) >= MAX_OWN_CREATIVES) {
    await cleanup();
    return { error: `A placement holds at most ${MAX_OWN_CREATIVES} creatives. Delete one first.` };
  }

  const px = (value) => (Number.isInteger(value) && value > 0 && value < 20000 ? value : null);
  // Users may not set a creative's kind or status themselves (column grants, migration 0004), so the
  // row is written with the service role. The user and the placement's owner were checked above.
  const { data: creative, error } = await serviceClient()
    .from("creatives")
    .insert({
      owner_id: user.id,
      name: String(name ?? "").trim().slice(0, 120) || "Own creative",
      storage_path: path,
      width_px: px(width),
      height_px: px(height),
      kind: "own",
      status: "approved",
    })
    .select("id, name")
    .single();
  if (error) {
    console.error("[DeusADS] own picture not saved:", error.code, error.message);
    await cleanup();
    return { error: isSchemaOutdated(error) ? NEEDS_OWN_MIGRATION : "Could not save the creative on our side. Nothing was lost: try again in a moment, and if it keeps failing, tell us." };
  }

  const { data: assignment, error: assignError } = await db
    .from("assignments")
    .insert({ placement_id: placementId, creative_id: creative.id, owner_id: user.id, active: true, source: "own" })
    .select("id")
    .single();
  if (assignError) {
    console.error("[DeusADS] own picture not placed:", assignError.code, assignError.message);
    await serviceClient().from("creatives").delete().eq("id", creative.id);
    await cleanup();
    return {
      error:
        assignError.code === "23514"
          ? `A placement holds at most ${MAX_OWN_CREATIVES} creatives. Delete one first.`
          : "Could not put the creative on the placement. Try again.",
    };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, assignmentId: assignment.id, creativeId: creative.id, name: creative.name };
}

/** Changes one of the developer's own pictures: switched on or off, and how it is framed. */
export async function saveOwnCreative({ assignmentId, enabled, crop }) {
  assignmentId = String(assignmentId ?? "");
  if (!assignmentId) return { error: "Unknown creative." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const changes = {};
  if (enabled !== undefined) changes.active = Boolean(enabled);
  let framing = null;
  if (crop !== undefined) {
    framing = normalizeCrop(crop);
    Object.assign(changes, { crop_zoom: framing.zoom, crop_x: framing.x, crop_y: framing.y });
  }
  if (Object.keys(changes).length === 0) return { ok: true };

  const { data, error } = await db
    .from("assignments")
    .update(changes)
    .eq("id", assignmentId)
    .eq("owner_id", user.id)
    .eq("source", "own")
    .select("id")
    .maybeSingle();
  if (isSchemaOutdated(error)) return { error: crop !== undefined ? NEEDS_CROP_MIGRATION : NEEDS_OWN_MIGRATION };
  if (error || !data) return { error: "Could not save. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, crop: framing ?? undefined };
}

/** Removes one of the developer's own pictures from its placement, with its file. */
export async function deleteOwnCreative({ assignmentId }) {
  assignmentId = String(assignmentId ?? "");
  if (!assignmentId) return { error: "Unknown creative." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: assignment } = await db
    .from("assignments")
    .select("id, creative_id, creatives ( id, kind, storage_path )")
    .eq("id", assignmentId)
    .eq("owner_id", user.id)
    .eq("source", "own")
    .maybeSingle();
  if (!assignment) return { error: "That creative is already gone." };

  // Only a creative that is an "own" picture is deleted with its assignment; anything else
  // (never expected here) would stay in its owner's library.
  const creative = assignment.creatives;
  if (creative?.kind === "own") {
    const { error } = await db.from("creatives").delete().eq("id", creative.id);
    if (error) return { error: "Could not delete the creative." };
    const { error: storageError } = await db.storage.from("creatives").remove([creative.storage_path]);
    if (storageError) console.warn("[DeusADS] own picture file not removed:", creative.storage_path, storageError.message);
  } else {
    const { error } = await db.from("assignments").delete().eq("id", assignmentId);
    if (error) return { error: "Could not delete the creative." };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- games

const MAX_NAME = 120;

/**
 * Issues a new key and retires the old one at once: games already shipped with
 * the old key stop receiving creatives and show their fallback textures until
 * the developer pastes the new key into a new build.
 */
export async function rotateApiKey({ gameId }) {
  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const apiKey = randomBytes(24).toString("hex");
  const { data, error } = await db
    .from("games")
    .update({ api_key: apiKey })
    .eq("id", String(gameId ?? ""))
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Could not issue a new key." };

  revalidatePath(`/dashboard/g/${data.id}`);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Deletes a game with its placements, assignments and impressions (they cascade).
 * The caller must send the game's exact name, so a stray click cannot do this.
 */
export async function deleteGame({ gameId, confirmName }) {
  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const id = String(gameId ?? "");
  const { data: game } = await db.from("games").select("id, name").eq("id", id).maybeSingle();
  if (!game) return { error: "That game no longer exists." };
  // The owner confirms by typing the word "delete".
  if (String(confirmName ?? "").trim().toLowerCase() !== "delete") {
    return { error: "Type delete to confirm. Nothing was deleted." };
  }
  // The icon file goes with the game (the column exists from migration 0019; without it: no icon).
  const { data: withIcon } = await db.from("games").select("icon_path").eq("id", id).maybeSingle();

  const { error } = await db.from("games").delete().eq("id", id);
  if (error) return { error: "Could not delete the game." };
  if (withIcon?.icon_path?.startsWith(`${user.id}/`)) await db.storage.from("creatives").remove([withIcon.icon_path]);

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- creatives

export async function renameCreative({ creativeId, name }) {
  const clean = String(name ?? "").trim().slice(0, MAX_NAME);
  if (!clean) return { error: "Give the creative a name." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data, error } = await db
    .from("creatives")
    .update({ name: clean })
    .eq("id", String(creativeId ?? ""))
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Could not rename the creative." };

  revalidatePath("/dashboard/creatives");
  return { ok: true, name: clean };
}

/**
 * Deletes a creative and its file. Placements showing it lose their assignment
 * (it cascades) and go back to the game's fallback texture; past impressions keep
 * their count with the creative cleared.
 */
export async function deleteCreative({ creativeId }) {
  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const id = String(creativeId ?? "");
  const { data: creative } = await db
    .from("creatives")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!creative) return { error: "That creative no longer exists." };

  // Pictures made for other formats go with the creative (the rows cascade; the files do not).
  const { data: extra } = await db.from("creative_assets").select("storage_path").eq("creative_id", id);

  const { error } = await db.from("creatives").delete().eq("id", id);
  if (error) return { error: "Could not delete the creative." };
  if (extra?.length) await db.storage.from("creatives").remove(extra.map((row) => row.storage_path));

  // The row is gone either way; a file that will not delete is only wasted space.
  const { error: storageError } = await db.storage.from("creatives").remove([creative.storage_path]);
  if (storageError) console.warn("[DeusADS] creative file not removed:", creative.storage_path, storageError.message);

  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const NEEDS_CROP_MIGRATION =
  "Framing is not saved yet: run supabase/migrations/0003_assignment_crop.sql in the Supabase SQL editor.";

const NEEDS_TARGETING_MIGRATION =
  "Run supabase/migrations/0018_targeting.sql in the Supabase SQL editor first.";

/** Switches a placement on or off in the advertiser catalog (migration 0014). Owner only, enforced by row-level security. */
export async function setPlacementOpen({ placementId, open }) {
  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (typeof placementId !== "string" || !placementId) return { error: "Unknown placement." };

  const { data, error } = await db
    .from("placements")
    .update({ open_to_advertisers: Boolean(open) })
    .eq("id", placementId)
    .eq("owner_id", user.id)
    .select("id");

  if (error) {
    return {
      error: isSchemaOutdated(error)
        ? "Run supabase/migrations/0014_open_to_advertisers.sql to turn this on."
        : "Could not save. Try again.",
    };
  }
  if (!data?.length) return { error: "Placement not found." };

  if (open) resyncCampaigns();
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
