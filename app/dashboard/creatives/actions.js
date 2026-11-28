"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { FORMATS, aspectClose, formatOf, normalizeSafeZone } from "../../../lib/formats";
import { canAdvertise } from "../../../lib/admin-rules";
import { cleanFolderName, cleanFormatCrops, moveInOrder, orderCreatives } from "../../../lib/creative-library";
import { loadCreativeEditor } from "../../../lib/advertiser-data";
import { after } from "next/server";
import { fitStoredPicture } from "../../../lib/creative-image";
import { makeVariants, removeVariants } from "../../../lib/astc-variants";
import { notify, notifyMany } from "../../../lib/notify";
import { keepReportedPicture, reporterOf } from "../../../lib/creative-reports";
import { isShapeKey, shapeAspect, shapeKey, shapeLabel } from "../../../lib/game-pictures";

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
 * one format of the list (formatId "r1x1" …). There are no pictures outside the list: "custom" means the nearest format.
 * An existing picture for the same standard format is replaced.
 */
export async function registerAsset({ creativeId, formatId, path, type, size, width, height, forShape = null }) {
  // `path`, `width` and `height` are reassigned below when the picture is made smaller.
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  if (typeof path !== "string" || !path.startsWith(`${me.user.id}/`) || path.includes("..")) {
    return { error: "Upload failed. Try again." };
  }
  const cleanup = () => me.service.storage.from("creatives").remove([path]);

  const creative = await ownCreative(me, creativeId, "id, name, storage_path");
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
  let w = Number(width);
  let h = Number(height);
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w < 20000 && h < 20000)) {
    await cleanup();
    return { error: "This file does not open as an image." };
  }
  const aspect = w / h;

  // A picture is always made for one of the formats of the list (the shapes the SDK offers): there are no others.
  if (formatId === "custom") formatId = isShapeKey(forShape) && FORMATS.some((item) => item.id === forShape) ? forShape : formatOf(aspect);
  let format = null;
  {
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

  // Bigger than the SDK can use: made smaller now, the original is not kept.
  const fitted = await fitStoredPicture(me.service, { path, type, width: w, height: h });
  if (fitted.error) {
    await cleanup();
    return { error: fitted.error };
  }
  if (fitted.resized) {
    path = fitted.path;
    w = fitted.width;
    h = fitted.height;
  }

  // Pictures made for a format are not moderated: they count from the moment they are uploaded. The exception is a
  // shape DeusADS holds after a report (migration 0065): a blocked shape takes no new picture, and a new picture for
  // a shape it asked to change waits for review, which is what ends the hold.
  // `forShape`: the picture is uploaded for a held shape that is not a standard format (say 21:9); it has to be about that shape.
  const wanted = !format && isShapeKey(forShape) && shapeAspect(forShape) ? forShape : null;
  if (wanted && !aspectClose(aspect, shapeAspect(wanted))) {
    await cleanup();
    return { error: `This image is ${aspect.toFixed(2)}:1; the ${shapeLabel(wanted)} shape needs about ${shapeAspect(wanted).toFixed(2)}:1 (within 15%).` };
  }
  const heldShape = format ? format.id : wanted ?? shapeKey(aspect);
  const { data: hold } = await me.service.from("creative_picture_holds").select("kind, dispute_id, sent_at").eq("creative_id", creative.id).eq("shape", heldShape).maybeSingle();
  if (hold?.kind === "blocked") {
    await cleanup();
    return { error: "DeusADS blocked this creative in this shape. Write to DeusADS under the decision if you think it is a mistake." };
  }
  if (hold?.kind === "changes" && hold.sent_at) {
    await cleanup();
    return { error: "The new picture for this shape is in review. Wait for the decision of DeusADS, then you can replace it." };
  }
  // The dispute keeps the picture that was reported (migration 0067): it is copied before the new one takes its place.
  if (hold?.kind === "changes" && hold.dispute_id) {
    const { data: was } = await me.service.from("creative_assets").select("storage_path").eq("creative_id", creative.id).eq("format_id", heldShape).eq("status", "approved").maybeSingle();
    await keepReportedPicture(me.service, hold.dispute_id, was?.storage_path ?? creative.storage_path).catch(() => null);
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
      await removeVariants(me.service, [row.storage_path]).catch(() => null);
    }
  }

  const status = hold?.kind === "changes" ? "pending" : "approved";
  const { data, error } = await me.service
    .from("creative_assets")
    .insert({
      creative_id: creative.id,
      format_id: format ? format.id : null,
      aspect: Math.round(aspect * 1000) / 1000, // of the picture as uploaded; a smaller copy has the same shape
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

  // A new picture for a shape DeusADS asked to change is not sent by itself: the advertiser looks at it and sends it
  // (sendHeldPicture). Until then nobody is told and the shape keeps waiting.
  if (status === "pending") revalidatePath("/dashboard/advertising");
  after(async () => {
    try {
      await makeVariants(me.service, path);
    } catch (error) {
      console.error("[DeusADS] compressed copies failed:", path, error?.message);
    }
  });
  refresh(creative.id);
  // the picture as it is stored now, so the page can show it at once
  return { ok: true, status, draft: status === "pending", notice: fitted.notice, id: data.id, url: me.service.storage.from("creatives").getPublicUrl(path).data.publicUrl, width: w, height: h };
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
  await removeVariants(me.service, [asset.storage_path]).catch(() => null);

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

// ---------------------------------------------------------------- a creative DeusADS holds after a report (migration 0064)

const NO_HOLD = "Run migration 0064 in the Supabase SQL editor first.";
const heldCreative = async (me, creativeId) => {
  const { data, error } = await me.service.from("creatives").select("*").eq("id", String(creativeId ?? "")).eq("owner_id", me.user.id).maybeSingle();
  return error ? null : data;
};

/**
 * A new main picture for a creative DeusADS asked to change. The old picture is gone, the crops and the safe zone made
 * for it are reset, and nothing runs yet: the new version still has to be sent for review.
 */
export async function replaceMainPicture({ creativeId, path, type, size, width, height }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (typeof path !== "string" || !path.startsWith(`${me.user.id}/`) || path.includes("..")) return { error: "Upload failed. Try again." };
  const cleanup = () => me.service.storage.from("creatives").remove([path]);
  const fail = async (error) => { await cleanup(); return { error }; };
  const creative = await heldCreative(me, creativeId);
  if (!creative) return fail("That creative no longer exists.");
  if (creative.hold !== "changes") return fail(creative.hold === "blocked" ? "This creative is blocked and cannot be changed. Add a different creative." : "A creative's main picture can only be replaced when DeusADS asks for a change.");
  if (creative.status === "pending") return fail("The new version is in review already.");
  if (!["image/png", "image/jpeg"].includes(type)) return fail("Images must be PNG or JPG.");
  if (!(size > 0) || size > MAX_BYTES) return fail("Images must be under 8 MB.");
  let w = Number(width);
  let h = Number(height);
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w < 20000 && h < 20000)) return fail("This file does not open as an image.");
  const fitted = await fitStoredPicture(me.service, { path, type, width: w, height: h });
  if (fitted.error) return fail(fitted.error);
  if (fitted.resized) { path = fitted.path; w = fitted.width; h = fitted.height; }

  const old = creative.storage_path;
  const { error } = await me.service.from("creatives").update({ storage_path: path, width_px: w, height_px: h, format_crops: null, safe_x: 0.15, safe_y: 0.15, safe_w: 0.7, safe_h: 0.7, picture_at: new Date().toISOString() }).eq("id", creative.id);
  if (error) return fail(["42703", "PGRST204"].includes(error.code) ? NO_HOLD : "Could not save. Try again.");
  if (old && old !== path) {
    await me.service.storage.from("creatives").remove([old]).catch(() => null);
    await removeVariants(me.service, [old]).catch(() => null);
  }
  after(async () => {
    try { await makeVariants(me.service, path); } catch (problem) { console.error("[DeusADS] compressed copies failed:", path, problem?.message); }
  });
  refresh(creative.id);
  return { ok: true, notice: fitted.notice };
}

/** The advertiser sends the changed creative back to DeusADS: it waits for review, and runs again once approved. */
export async function sendNewVersion({ creativeId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const creative = await heldCreative(me, creativeId);
  if (!creative) return { error: "That creative no longer exists." };
  if (creative.hold !== "changes") return { error: "DeusADS did not ask to change this creative." };
  if (creative.status === "pending") return { ok: true };
  const { data: fresh } = await me.service.from("creative_assets").select("id").eq("creative_id", creative.id).gt("created_at", creative.hold_at ?? "1970-01-01").limit(1);
  const changed = Boolean(creative.picture_at && creative.picture_at > (creative.hold_at ?? "")) || (fresh ?? []).length > 0;
  if (!changed) return { error: "Replace the picture first: nothing has changed since DeusADS asked." };
  const { error } = await me.service.from("creatives").update({ status: "pending", hold_sent_at: new Date().toISOString() }).eq("id", creative.id).eq("hold", "changes");
  if (error) return { error: "Could not send it. Try again." };
  const { data: admins } = await me.service.from("accounts").select("id").eq("role", "admin");
  await notifyMany(me.service, (admins ?? []).map((row) => row.id), `"${creative.name}": new version to review (changed after a report).`, "/dashboard/admin", "admin_reports");
  refresh(creative.id);
  revalidatePath("/dashboard/advertising");
  return { ok: true };
}

/** The advertiser writes to DeusADS about a creative on hold: a question, or why the decision is wrong. The review team answers in the dispute. */
export async function replyToDeusADS({ creativeId, disputeId, text }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const clean = String(text ?? "").trim().slice(0, 1000);
  if (!clean) return { error: "Write your reply first." };
  const creative = await heldCreative(me, creativeId);
  if (!creative) return { error: "There is nothing to reply to." };
  // the decision this is about: the one that holds the creative, or one of its pictures
  const { data: pictures } = await me.service.from("creative_picture_holds").select("dispute_id").eq("creative_id", creative.id);
  const open = [creative.hold ? creative.hold_dispute : null, ...(pictures ?? []).map((row) => row.dispute_id)].filter(Boolean);
  const target = open.includes(disputeId) ? disputeId : open.length === 1 ? open[0] : null;
  if (!target) return { error: "There is nothing to reply to." };
  const { count } = await me.service.from("dispute_events").select("id", { count: "exact", head: true }).eq("dispute_id", target).eq("side", "advertiser").eq("kind", "reply");
  if ((count ?? 0) >= 30) return { error: "This conversation is too long. Write to us in Help & feedback." };
  const { error } = await me.service.from("dispute_events").insert({ dispute_id: target, author_id: me.user.id, side: "advertiser", kind: "reply", text: clean });
  if (error) return { error: "Could not send the reply. Try again." };
  const { data: admins } = await me.service.from("accounts").select("id").eq("role", "admin");
  await notifyMany(me.service, (admins ?? []).map((row) => row.id), `Advertiser wrote about "${creative.name}": ${clean}`, `/dashboard/admin/disputes?card=dispute:${target}`, "admin_reports");
  revalidatePath("/dashboard/admin/disputes");
  refresh(creative.id);
  revalidatePath("/dashboard/advertising");
  return { ok: true, message: { side: "advertiser", text: clean, at: new Date().toISOString() } };
}


/**
 * The advertiser sends the new picture of a shape DeusADS asked to change for review. Only now the dispute moves on:
 * DeusADS gets it to check, and the developer who reported the picture is told.
 */
export async function sendHeldPicture({ creativeId, shape }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const creative = await ownCreative(me, creativeId, "id, name");
  if (!creative) return { error: "That creative no longer exists." };
  const { data: hold } = await me.service.from("creative_picture_holds").select("kind, dispute_id, sent_at").eq("creative_id", creative.id).eq("shape", String(shape ?? "")).maybeSingle();
  if (!hold || hold.kind !== "changes") return { error: "DeusADS is not waiting for a new picture of this shape." };
  if (hold.sent_at) return { ok: true, already: true };
  const { data: asset } = await me.service.from("creative_assets").select("id, width_px, height_px").eq("creative_id", creative.id).eq("format_id", shape).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!asset) return { error: "Upload the new picture first." };

  const now = new Date().toISOString();
  const { error } = await me.service.from("creative_picture_holds").update({ sent_at: now }).eq("creative_id", creative.id).eq("shape", shape);
  if (error) return { error: "Could not send it. Try again." };
  // the dispute keeps what happened, and is where the picture is reviewed
  if (hold.dispute_id) await me.service.from("dispute_events").insert({ dispute_id: hold.dispute_id, author_id: me.user.id, side: "advertiser", kind: "decision", text: `picture: uploaded ${asset.width_px} × ${asset.height_px}` }).then(() => null, () => null);
  // the developer who reported it follows the report too
  const reporter = await reporterOf(me.service, hold.dispute_id).catch(() => null);
  if (reporter) await notify(me.service, { accountId: reporter, text: `Your report on "${creative.name}": the advertiser sent a new picture. DeusADS is checking it.`, link: `/dashboard/support?tab=requests&report=${hold.dispute_id}`, type: "dev_report_decided" });
  const { data: admins } = await me.service.from("accounts").select("id").eq("role", "admin");
  await notifyMany(me.service, (admins ?? []).map((row) => row.id), `"${creative.name}": new picture to review (replaces a reported one).`, hold.dispute_id ? `/dashboard/admin/disputes?card=dispute:${hold.dispute_id}` : "/dashboard/admin/disputes", "admin_reports");
  revalidatePath("/dashboard/admin/disputes");
  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/support");
  refresh(creative.id);
  return { ok: true, at: now };
}
