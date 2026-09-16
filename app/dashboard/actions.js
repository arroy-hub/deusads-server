"use server";

import { revalidatePath } from "next/cache";
import { userClient } from "../../lib/supabase-server";

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

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Records a creative whose file the browser has already put in Storage.
 * The file never passes through this function, so its size is not bound by
 * the Server Action body limit.
 */
export async function registerCreative({ name, path, type, size, width, height }) {
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

  const cleanName = String(name ?? "").trim().slice(0, 120) || "Untitled creative";
  const px = (value) => (Number.isInteger(value) && value > 0 && value < 20000 ? value : null);

  const { data, error } = await db
    .from("creatives")
    .insert({
      owner_id: user.id,
      name: cleanName,
      storage_path: path,
      width_px: px(width),
      height_px: px(height),
    })
    .select("id, name")
    .single();

  if (error) {
    // Do not leave an orphaned file behind.
    await db.storage.from("creatives").remove([path]);
    return { error: "Uploaded the image but could not save it." };
  }

  revalidatePath("/dashboard/creatives");
  return { ok: true, creative: data };
}

/**
 * Puts a creative on a placement (or clears it). Returns as soon as the rows
 * are written; the card updates itself and refreshes the page in the
 * background, so the user is not waiting on a full re-render.
 */
export async function assignCreative({ placementId, creativeId }) {
  placementId = String(placementId ?? "");
  creativeId = String(creativeId ?? "");
  if (!placementId) return { error: "Unknown placement." };

  const { db, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  // One active assignment per placement; the old row is kept but retired, so a
  // past campaign can still be explained later.
  const { error: retireError } = await db
    .from("assignments")
    .update({ active: false })
    .eq("placement_id", placementId)
    .eq("active", true);

  if (retireError) return { error: "Could not save. Try again." };

  if (creativeId) {
    const { error } = await db.from("assignments").insert({
      placement_id: placementId,
      creative_id: creativeId,
      owner_id: user.id,
      active: true,
    });

    if (error) return { error: "Could not assign the creative." };
  }

  return { ok: true, creativeId };
}
