// The server side of the support system: what happens when somebody sends a request, writes in one, changes a
// status or a type, or sorts requests into folders. Every function takes the service-role client `db` and the
// caller `actor` ({ id, role }) who has already been identified (getMember()), and re-checks what that role may do:
// a person only touches their own requests, only an admin writes internal notes or changes status and type.
// Returns { ok: true, ... } or { error }. The rules themselves live in lib/support-rules.js.

import { randomUUID } from "node:crypto";
import { isSchemaOutdated } from "./api.js";
import { notify } from "./notify.js";
import {
  LIMITS, TYPE_LABEL, canSetStatus, changeType, cleanBody, cleanContext, cleanFolderName, cleanRequest, filesProblem,
  isStatus, isType, lockOf, requestRateProblem, screenshotKind, screenshotPath, statusAfterMessage,
} from "./support-rules.js";

export const BUCKET = "support";
export const OUTDATED = "The database needs update 0052 first. Ask an admin to run it.";
const GONE = "Something went wrong. Try again.";
const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const isAdmin = (actor) => actor?.role === "admin";
const mine = (request, actor) => request.owner_id === actor.id;
const iso = (ms) => new Date(ms).toISOString();

async function loadRequest(db, id) {
  const { data, error } = await db.from("support_requests").select("*").eq("id", String(id ?? "")).maybeSingle();
  return { request: error ? null : data, error };
}

async function adminIds(db) {
  const { data } = await db.from("accounts").select("id").eq("role", "admin");
  return (data ?? []).map((row) => row.id);
}

async function companyOf(db, id) {
  const { data } = await db.from("accounts").select("company, email").eq("id", id).maybeSingle();
  return data?.company || data?.email || "A user";
}

const adminLink = (id) => `/dashboard/admin/support?open=${id}`;
const userLink = (id) => `/dashboard/support?tab=requests&open=${id}`;

async function tellAdmins(db, text, id) {
  const ids = await adminIds(db);
  await Promise.allSettled(ids.map((accountId) => notify(db, { accountId, text, link: adminLink(id), type: "admin_support" })));
}

const tellOwner = (db, request, text) =>
  notify(db, { accountId: request.owner_id, text, link: userLink(request.id), type: "support_reply" });

/** Stores screenshots already checked by filesProblem: the private bucket plus a row each. */
async function storeScreenshots(db, { ownerId, requestId, messageId, files }) {
  let failed = 0;
  for (const file of files ?? []) {
    const kind = screenshotKind(file.bytes);
    const path = screenshotPath(ownerId, requestId, kind, randomUUID());
    const up = await db.storage.from(BUCKET).upload(path, file.bytes, { contentType: MIME[kind], upsert: false });
    if (up.error) { failed += 1; continue; }
    const row = await db.from("support_attachments").insert({ message_id: messageId, path, mime: MIME[kind], size: file.bytes.length });
    if (row.error) {
      failed += 1;
      await db.storage.from(BUCKET).remove([path]).catch(() => null);
    }
  }
  return failed ? "Some screenshots could not be saved." : null;
}

/** A new request: the first message is the person's text. `via` is "assistant" when it came from the chat. */
export async function createRequest(db, { actor, type, title, text, context, via = "form", files = [] }) {
  const clean = cleanRequest({ type, title, text });
  if (clean.error) return { error: clean.error };
  const bad = filesProblem(files);
  if (bad) return { error: bad };

  const recent = await db.from("support_requests").select("id", { count: "exact", head: true }).eq("owner_id", actor.id).gte("created_at", iso(Date.now() - 3600000));
  if (isSchemaOutdated(recent.error)) return { error: OUTDATED };
  const rate = requestRateProblem(recent.count ?? 0);
  if (rate) return { error: rate };

  const made = await db
    .from("support_requests")
    .insert({ owner_id: actor.id, type: clean.type, title: clean.title, created_via: via === "assistant" ? "assistant" : "form", context: cleanContext(context) })
    .select("id, number")
    .single();
  if (isSchemaOutdated(made.error)) return { error: OUTDATED };
  if (made.error || !made.data) return { error: GONE };

  const first = await db.from("support_messages").insert({ request_id: made.data.id, kind: "user", author_id: actor.id, body: clean.text }).select("id").single();
  if (first.error || !first.data) {
    await db.from("support_requests").delete().eq("id", made.data.id);
    return { error: GONE };
  }
  const warning = await storeScreenshots(db, { ownerId: actor.id, requestId: made.data.id, messageId: first.data.id, files });
  await tellAdmins(db, `${TYPE_LABEL[clean.type]} from ${await companyOf(db, actor.id)}: ${clean.title}`, made.data.id);
  return { ok: true, id: made.data.id, number: made.data.number, warning };
}

/** A message in a request. A person writes in their own open requests; an admin anywhere (a reply reopens a resolved one). */
export async function postMessage(db, { actor, requestId, body, note = false, files = [] }) {
  const { request, error } = await loadRequest(db, requestId);
  if (isSchemaOutdated(error)) return { error: OUTDATED };
  const admin = isAdmin(actor);
  if (!request || (!admin && !mine(request, actor))) return { error: "Request not found." };
  if (note && !admin) return { error: "Not allowed." };
  if (!admin) {
    const lock = lockOf(request);
    if (lock) return { error: lock.why, followUp: lock.followUp };
  }
  const text = cleanBody(body);
  if (!text && !files.length) return { error: "Write a message." };
  const bad = filesProblem(files);
  if (bad) return { error: bad };

  const kind = admin ? (note ? "note" : "developer") : "user";
  const sent = await db.from("support_messages").insert({ request_id: request.id, kind, author_id: actor.id, body: text }).select("id").single();
  if (sent.error || !sent.data) return { error: GONE };

  const status = statusAfterMessage(request, { from: admin ? "admin" : "user", note });
  const now = new Date().toISOString();
  const patch = {};
  if (!note) patch.last_message_at = now;
  if (status !== request.status) {
    patch.status = status;
    patch.status_changed_at = now;
    patch.resolved_by = status === "resolved" ? request.resolved_by : null;
  }
  if (admin && !note) patch.user_unread = true;
  if (!admin) patch.admin_unread = true;
  if (Object.keys(patch).length) await db.from("support_requests").update(patch).eq("id", request.id);

  const warning = await storeScreenshots(db, { ownerId: request.owner_id, requestId: request.id, messageId: sent.data.id, files });
  if (admin && !note) await tellOwner(db, request, `The developer replied to your request #${request.number}: ${request.title}`);
  if (!admin) await tellAdmins(db, `${await companyOf(db, actor.id)} wrote in #${request.number}: ${request.title}`, request.id);
  return { ok: true, status, warning };
}

/** The admin sets a status by hand. Noted is for ideas only, Resolved never for ideas. */
export async function setStatus(db, { actor, requestId, status }) {
  if (!isAdmin(actor)) return { error: "Not allowed." };
  if (!isStatus(status)) return { error: "Unknown status." };
  const { request, error } = await loadRequest(db, requestId);
  if (isSchemaOutdated(error)) return { error: OUTDATED };
  if (!request) return { error: "Request not found." };
  if (!canSetStatus(request.type, status)) {
    return { error: request.type === "idea" ? "An idea can be noted but never resolved." : "Only an idea can be noted." };
  }
  if (status === request.status) return { ok: true, status };
  const upd = await db
    .from("support_requests")
    .update({ status, status_changed_at: new Date().toISOString(), resolved_by: status === "resolved" ? "developer" : null, user_unread: true })
    .eq("id", request.id);
  if (upd.error) return { error: GONE };
  if (status === "resolved") await tellOwner(db, request, `Your request #${request.number} was resolved: ${request.title}`);
  if (status === "noted") await tellOwner(db, request, `Your idea #${request.number} was noted: ${request.title}`);
  return { ok: true, status };
}

/** Several requests at once. Requests the status does not suit are skipped and counted. */
export async function setStatusMany(db, { actor, ids, status }) {
  if (!isAdmin(actor)) return { error: "Not allowed." };
  let updated = 0;
  let skipped = 0;
  for (const id of [...new Set(ids ?? [])]) {
    const result = await setStatus(db, { actor, requestId: id, status });
    if (result.ok) updated += 1;
    else skipped += 1;
  }
  return { ok: true, updated, skipped };
}

/** The admin changes the type of a request. The status is never touched. */
export async function setType(db, { actor, requestId, type }) {
  if (!isAdmin(actor)) return { error: "Not allowed." };
  if (!isType(type)) return { error: "Unknown type." };
  const { request, error } = await loadRequest(db, requestId);
  if (isSchemaOutdated(error)) return { error: OUTDATED };
  if (!request) return { error: "Request not found." };
  const next = changeType(request, type);
  const upd = await db.from("support_requests").update({ type: next.type }).eq("id", request.id);
  return upd.error ? { error: GONE } : { ok: true, type: next.type };
}

/** The reader has opened the request: the unread mark of their side goes. */
export async function markRead(db, { actor, requestId }) {
  const { request } = await loadRequest(db, requestId);
  const admin = isAdmin(actor);
  if (!request || (!admin && !mine(request, actor))) return { error: "Request not found." };
  const upd = await db.from("support_requests").update(admin ? { admin_unread: false } : { user_unread: false }).eq("id", request.id);
  return upd.error ? { error: GONE } : { ok: true };
}

// ---------------------------------------------------------------- folders (a person's own)

export async function createFolder(db, { actor, name }) {
  const clean = cleanFolderName(name);
  if (!clean) return { error: "Give the folder a name." };
  const { data: last } = await db.from("support_folders").select("position").eq("owner_id", actor.id).order("position", { ascending: false }).limit(1);
  const made = await db.from("support_folders").insert({ owner_id: actor.id, name: clean, position: (last?.[0]?.position ?? -1) + 1 }).select("id, name").single();
  if (isSchemaOutdated(made.error)) return { error: OUTDATED };
  return made.error || !made.data ? { error: GONE } : { ok: true, id: made.data.id, name: made.data.name };
}

export async function renameFolder(db, { actor, folderId, name }) {
  const clean = cleanFolderName(name);
  if (!clean) return { error: "Give the folder a name." };
  const upd = await db.from("support_folders").update({ name: clean }).eq("id", String(folderId ?? "")).eq("owner_id", actor.id).select("id");
  return upd.error ? { error: GONE } : upd.data?.length ? { ok: true, name: clean } : { error: "Folder not found." };
}

/** Deleting a folder keeps its requests: they go back to the list outside folders. */
export async function deleteFolder(db, { actor, folderId }) {
  const del = await db.from("support_folders").delete().eq("id", String(folderId ?? "")).eq("owner_id", actor.id).select("id");
  return del.error ? { error: GONE } : del.data?.length ? { ok: true } : { error: "Folder not found." };
}

/**
 * Puts requests in a folder (or outside any folder, `folderId` null) in this order. One call covers reordering,
 * moving between folders and taking a request out of a folder; only the person's own requests and folders count.
 */
export async function placeRequests(db, { actor, folderId = null, orderedIds }) {
  const ids = [...new Set(orderedIds ?? [])];
  if (!ids.length) return { ok: true };
  if (folderId) {
    const { data } = await db.from("support_folders").select("id").eq("id", String(folderId)).eq("owner_id", actor.id).maybeSingle();
    if (!data) return { error: "Folder not found." };
  }
  const { data: owned, error } = await db.from("support_requests").select("id").eq("owner_id", actor.id).in("id", ids);
  if (isSchemaOutdated(error)) return { error: OUTDATED };
  const allowed = new Set((owned ?? []).map((row) => row.id));
  let position = 0;
  for (const id of ids) {
    if (!allowed.has(id)) continue;
    const upd = await db.from("support_requests").update({ folder_id: folderId ?? null, position }).eq("id", id).eq("owner_id", actor.id);
    if (upd.error) return { error: GONE };
    position += 1;
  }
  return { ok: true };
}

/** Short-lived links for the screenshots of a request (one hour). Rows are { path }. */
export async function screenshotLinks(db, attachments) {
  const paths = (attachments ?? []).map((row) => row.path);
  if (!paths.length) return {};
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const links = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) links[item.path] = item.signedUrl;
  return links;
}

export { LIMITS };
