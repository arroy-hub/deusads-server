"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { userClient } from "../../lib/supabase-server";
import { isSchemaOutdated } from "../../lib/api";
import { isCategory } from "../../lib/categories";
import { normalizeCrop, sameCrop, DEFAULT_CROP } from "../../lib/surface-math";

// Every action writes through the user's own client, so row-level security is
// what actually enforces ownership. The owner_id below is convenience, not the
// security boundary: a forged value is rejected by the database.

const MAX_BYTES = 8 * 1024 * 1024;

/** One client and one auth round-trip per action. */
async function session() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  return { db, user: data?.user ?? null };
}

export async function createGame(formData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the game a name." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { error } = await db.from("games").insert({ owner_id: user.id, name });

  if (error) return { error: "Could not create the game." };

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

/**
 * Puts a creative on a placement (or clears it) with its framing. Returns as
 * soon as the rows are written; the card updates itself and refreshes the page
 * in the background, so the user is not waiting on a full re-render.
 *
 * Reframing the creative a placement already shows edits that assignment in
 * place; a different creative retires it and starts a new one.
 */
export async function assignCreative({ placementId, creativeId, crop }) {
  placementId = String(placementId ?? "");
  creativeId = String(creativeId ?? "");
  if (!placementId) return { error: "Unknown placement." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const framing = normalizeCrop(crop);
  const cropColumns = { crop_zoom: framing.zoom, crop_x: framing.x, crop_y: framing.y };
  const framed = !sameCrop(framing, DEFAULT_CROP);

  const { data: current, error: readError } = await db
    .from("assignments")
    .select("id, creative_id")
    .eq("placement_id", placementId)
    .eq("active", true)
    .maybeSingle();

  if (readError) return { error: "Could not save. Try again." };

  if (current && creativeId && current.creative_id === creativeId) {
    const { error } = await db.from("assignments").update(cropColumns).eq("id", current.id);
    if (isSchemaOutdated(error)) return { error: NEEDS_CROP_MIGRATION };
    if (error) return { error: "Could not save the framing." };
    return { ok: true, creativeId, crop: framing };
  }

  // One active assignment per placement; the old row is kept but retired, so a
  // past campaign can still be explained later.
  if (current) {
    const { error } = await db.from("assignments").update({ active: false }).eq("id", current.id);
    if (error) return { error: "Could not save. Try again." };
  }

  if (!creativeId) return { ok: true, creativeId, crop: DEFAULT_CROP };

  const row = {
    placement_id: placementId,
    creative_id: creativeId,
    owner_id: user.id,
    active: true,
  };

  let { error } = await db.from("assignments").insert({ ...row, ...cropColumns });
  let warning;
  if (isSchemaOutdated(error)) {
    // Database without migration 0003: the creative still goes live, cover-fitted.
    ({ error } = await db.from("assignments").insert(row));
    if (framed) warning = NEEDS_CROP_MIGRATION;
  }

  if (error) return { error: "Could not assign the creative." };
  return { ok: true, creativeId, crop: warning ? DEFAULT_CROP : framing, warning };
}

// ---------------------------------------------------------------- games

const MAX_NAME = 120;

export async function renameGame({ gameId, name }) {
  const clean = String(name ?? "").trim().slice(0, MAX_NAME);
  if (!clean) return { error: "Give the game a name." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data, error } = await db
    .from("games")
    .update({ name: clean })
    .eq("id", String(gameId ?? ""))
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Could not rename the game." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, name: clean };
}

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
  if (String(confirmName ?? "").trim() !== game.name) {
    return { error: "The name does not match. Nothing was deleted." };
  }

  const { error } = await db.from("games").delete().eq("id", id);
  if (error) return { error: "Could not delete the game." };

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

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
