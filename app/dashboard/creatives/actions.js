"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { FORMATS, aspectClose, normalizeSafeZone } from "../../../lib/formats";

const MAX_BYTES = 8 * 1024 * 1024;
const MISSING = "Run migration 0017 in the Supabase SQL editor first.";

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
