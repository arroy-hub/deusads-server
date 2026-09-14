"use server";

import { revalidatePath } from "next/cache";
import { userClient, currentUser } from "../../lib/supabase-server";

// Every action writes through the user's own client, so row-level security is
// what actually enforces ownership. The owner_id below is convenience, not the
// security boundary: a forged value is rejected by the database.

export async function createGame(formData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the game a name." };

  const user = await currentUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const db = await userClient();
  const { error } = await db.from("games").insert({ owner_id: user.id, name });

  if (error) return { error: "Could not create the game." };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadCreative(formData) {
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();

  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    return { error: "Creatives must be PNG or JPG." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: "Creatives must be under 8 MB." };
  }

  const user = await currentUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const db = await userClient();
  const extension = file.type === "image/png" ? "png" : "jpg";
  // The path is scoped by user id so storage policies can mirror the table rules.
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from("creatives")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { error: "Upload failed. Try again." };

  const { error } = await db.from("creatives").insert({
    owner_id: user.id,
    name: name || file.name,
    storage_path: path,
  });

  if (error) return { error: "Uploaded the image but could not save it." };

  revalidatePath("/dashboard/creatives");
  return { ok: true };
}

export async function assignCreative(formData) {
  const placementId = String(formData.get("placementId") ?? "");
  const creativeId = String(formData.get("creativeId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");

  const user = await currentUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const db = await userClient();

  // One active assignment per placement; the old row is kept but retired, so a
  // past campaign can still be explained later.
  await db
    .from("assignments")
    .update({ active: false })
    .eq("placement_id", placementId)
    .eq("active", true);

  if (creativeId) {
    const { error } = await db.from("assignments").insert({
      placement_id: placementId,
      creative_id: creativeId,
      owner_id: user.id,
      active: true,
    });

    if (error) return { error: "Could not assign the creative." };
  }

  revalidatePath(`/dashboard/g/${gameId}`);
  return { ok: true };
}
