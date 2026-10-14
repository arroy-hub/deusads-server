"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { FORMATS, aspectClose, normalizeSafeZone } from "../../../lib/formats";
import { canAdvertise } from "../../../lib/admin-rules";
import { cleanFolderName, cleanFormatCrops, moveInOrder, orderCreatives } from "../../../lib/creative-library";
import { loadCreativeEditor } from "../../../lib/advertiser-data";

const MAX_BYTES = 8 * 1024 * 1024;
const MISSING = "Run migration 0017 in the Supabase SQL editor first.";
const MISSING_CABINET = "Run migration 0028 in the Supabase SQL editor first.";

// Writes go through the service client after an explicit ownership check: the tables
// have no write grants for users (migration 0017).

async function ownCreative(me, creativeId, columns = "id, storage_path") {
  const { data } = await me.service
    .from("creatives")
    .select(columns)
    .eq("id", String(creativeId ?? ""))
    .eq("owner_id", me.user.id)
    .maybeSingle();
  return data;
}

function refresh(creativeId) {
  revalidatePath(`/dashboard/creatives/${creativeId}`);
  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard/admin");
}

/** Where the part of the main image that must stay visible is (fractions of the image). */
export async function saveSafeZone({ creativeId, x, y, w, h }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const creative = await ownCreative(me, creativeId);
  if (!creative) return { error: "That creative no longer exists." };

  const zone = normalizeSafeZone({ x, y, w, h });
  const round = (value) => Math.round(value * 10000) / 10000;
  const { error } = await me.service
    .from("creatives")
    .update({ safe_x: round(zone.x), safe_y: round(zone.y), safe_w: round(zone.w), safe_h: round(zone.h) })
    .eq("id", creative.id);
  if (isSchemaOutdated(error)) return { error: MISSING };
  if (error) return { error: "Could not save. Try again." };

  refresh(creative.id);
  return { ok: true, zone };
}

/**
 * Records an image the browser already uploaded to Storage as the creative's picture for
 * one standard format (formatId "r1x1" …) or for a custom shape (formatId "custom").
 * An existing picture for the same standard format is replaced.
 */
export async function registerAsset({ creativeId, formatId, path, type, size, width, height }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  if (typeof path !== "string" || !path.startsWith(`${me.user.id}/`) || path.includes("..")) {
    return { error: "Upload failed. Try again." };
  }
  const cleanup = () => me.service.storage.from("creatives").remove([path]);

  const creative = await ownCreative(me, creativeId);
  if (!creative) {
    await cleanup();
    return { error: "That creative no longer exists." };
  }
  if (!["image/png", "image/jpeg"].includes(type)) {
    await cleanup();
    return { error: "Images must be PNG or JPG." };
  }
  if (!(size > 0) || size > MAX_BYTES) {
    await cleanup();
    return { error: "Images must be under 8 MB." };
  }
  const w = Number(width);
  const h = Number(height);
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w < 20000 && h < 20000)) {
    await cleanup();
    return { error: "This file does not open as an image." };
  }
  const aspect = w / h;

  let format = null;
  if (formatId !== "custom") {
    format = FORMATS.find((item) => item.id === formatId);
    if (!format) {
      await cleanup();
      return { error: "Unknown format." };
    }
    if (!aspectClose(aspect, format.aspect)) {
      await cleanup();
      return { error: `This image is ${aspect.toFixed(2)}:1; ${format.label} needs about ${format.aspect.toFixed(2)}:1 (within 15%).` };
    }
  }

  // Replacing: the old picture for this format goes first (one per standard format).
  if (format) {
    const { data: old, error: oldError } = await me.service
      .from("creative_assets")
      .select("id, storage_path")
      .eq("creative_id", creative.id)
      .eq("format_id", format.id);
    if (oldError) {
      await cleanup();
      return { error: isSchemaOutdated(oldError) || oldError.code === "42P01" ? MISSING : "Could not save. Try again." };
    }
    for (const row of old ?? []) {
      await me.service.from("creative_assets").delete().eq("id", row.id);
      await me.service.storage.from("creatives").remove([row.storage_path]);
    }
  }

  // A new picture from an advertiser is reviewed like a new creative; a developer's or an admin's own is not.
  const status = me.role === "advertiser" ? "pending" : "approved";
  const { data, error } = await me.service
    .from("creative_assets")
    .insert({
      creative_id: creative.id,
      format_id: format ? format.id : null,
      aspect: Math.round(aspect * 1000) / 1000,
      storage_path: path,
      width_px: w,
      height_px: h,
      status,
      ...(status === "approved" ? { reviewed_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();
  if (error || !data) {
    await cleanup();
    return { error: isSchemaOutdated(error) || error?.code === "42P01" ? MISSING : "Could not save. Try again." };
  }

  refresh(creative.id);
  return { ok: true, status };
}

/** Remove one extra picture of one of the caller's creatives. */
export async function deleteAsset({ assetId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const { data: asset } = await me.service
    .from("creative_assets")
    .select("id, creative_id, storage_path")
    .eq("id", String(assetId ?? ""))
    .maybeSingle();
  if (!asset) return { error: "That image no longer exists." };
  const creative = await ownCreative(me, asset.creative_id);
  if (!creative) return { error: "Not allowed." };

  const { error } = await me.service.from("creative_assets").delete().eq("id", asset.id);
  if (error) return { error: "Could not delete the image." };
  await me.service.storage.from("creatives").remove([asset.storage_path]);

  refresh(creative.id);
  return { ok: true };
}

// ---------------------------------------------------------------- folders, order and framing (migration 0028)

async function ownFolder(me, folderId) {
  const { data } = await me.service
    .from("creative_folders")
    .select("id, name")
    .eq("id", String(folderId ?? ""))
    .eq("owner_id", me.user.id)
    .maybeSingle();
  return data;
}

const folderError = (error) => {
  if (isSchemaOutdated(error)) return MISSING_CABINET;
  if (error?.code === "23505") return "You already have a folder with that name.";
  return "Could not save. Try again.";
};

/** A new folder in the caller's creative library. */
export async function createFolder({ name }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const clean = cleanFolderName(name);
  if (!clean) return { error: "Give the folder a name." };

  const { data, error } = await me.service.from("creative_folders").insert({ owner_id: me.user.id, name: clean }).select("id, name").single();
  if (error || !data) return { error: folderError(error) };

  revalidatePath("/dashboard/creatives");
  return { ok: true, folder: data };
}

export async function renameFolder({ folderId, name }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const clean = cleanFolderName(name);
  if (!clean) return { error: "Give the folder a name." };
  const folder = await ownFolder(me, folderId);
  if (!folder) return { error: "That folder no longer exists." };

  const { error } = await me.service.from("creative_folders").update({ name: clean }).eq("id", folder.id);
  if (error) return { error: folderError(error) };

  revalidatePath("/dashboard/creatives");
  return { ok: true, name: clean };
}

/** Deletes a folder; the creatives in it stay in the library, outside any folder. */
export async function deleteFolder({ folderId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const folder = await ownFolder(me, folderId);
  if (!folder) return { ok: true };

  const { error } = await me.service.from("creative_folders").delete().eq("id", folder.id);
  if (error) return { error: folderError(error) };

  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard/advertising/new");
  return { ok: true };
}

/**
 * Puts a creative in a folder (or out of any: folderId empty) and in front of another creative (beforeId), or last.
 * The whole library gets its numbers again, so the order is the one the advertiser sees.
 */
export async function moveCreative({ creativeId, folderId, beforeId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const creative = await ownCreative(me, creativeId);
  if (!creative) return { error: "That creative no longer exists." };

  let target = null;
  if (folderId) {
    target = await ownFolder(me, folderId);
    if (!target) return { error: "That folder no longer exists." };
  }

  const { data: rows, error } = await me.service
    .from("creatives")
    .select("id, sort_index, created_at")
    .eq("owner_id", me.user.id)
    .neq("kind", "own");
  if (isSchemaOutdated(error)) return { error: MISSING_CABINET };
  if (error) return { error: "Could not save. Try again." };

  const current = orderCreatives(rows ?? []);
  const next = moveInOrder(current.map((row) => row.id), creative.id, beforeId ? String(beforeId) : null);
  const was = new Map(current.map((row, index) => [row.id, row.sort_index]));
  const writes = [];
  next.forEach((id, index) => {
    const folder = id === creative.id ? { folder_id: target ? target.id : null } : {};
    if (was.get(id) !== index || id === creative.id) writes.push(me.service.from("creatives").update({ sort_index: index, ...folder }).eq("id", id).eq("owner_id", me.user.id));
  });
  const results = await Promise.all(writes);
  if (results.some((result) => result.error)) return { error: "Could not save. Try again." };

  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard/advertising/new");
  return { ok: true };
}

/**
 * Saves how the advertiser framed the main picture for each ad shape: { r16x9: { zoom, x, y }, ... }.
 * The whole set is replaced, so a shape left out goes back to the automatic crop.
 */
export async function saveFormatCrops({ creativeId, crops }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const creative = await ownCreative(me, creativeId);
  if (!creative) return { error: "That creative no longer exists." };

  const clean = cleanFormatCrops(crops);
  const { error } = await me.service.from("creatives").update({ format_crops: clean }).eq("id", creative.id);
  if (isSchemaOutdated(error)) return { error: MISSING_CABINET };
  if (error) return { error: "Could not save. Try again." };

  refresh(creative.id);
  revalidatePath("/dashboard/advertising/new");
  return { ok: true, crops: clean ?? {} };
}

/** What the creative editor needs for one creative; the new-campaign page opens the editor without leaving the wizard. */
export async function openCreativeEditor({ creativeId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const editor = await loadCreativeEditor(me.service, me, creativeId);
  if (!editor) return { error: "That creative no longer exists." };
  return { ok: true, editor };
}
