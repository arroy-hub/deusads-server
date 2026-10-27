// What the Help & feedback page reads: a person's own requests, folders and conversations.
// Every function answers `{ outdated: true }` when migration 0052 is missing, never throws.

import { isSchemaOutdated } from "./api";
import { screenshotLinks } from "./support-server";

const REQUEST_COLUMNS = "id, number, type, title, status, folder_id, position, user_unread, created_via, created_at, last_message_at, status_changed_at";

/** The shape the page works with (dates as ISO strings). */
const shape = (row) => ({
  id: row.id,
  number: row.number,
  type: row.type,
  title: row.title,
  status: row.status,
  folderId: row.folder_id ?? null,
  position: row.position ?? 0,
  unread: Boolean(row.user_unread),
  via: row.created_via,
  createdAt: row.created_at,
  lastMessageAt: row.last_message_at,
  statusChangedAt: row.status_changed_at,
});

/** How many of a person's requests have a reply they have not read yet (the menu and corner badge). */
export async function unreadSupport(db, ownerId) {
  if (!ownerId) return 0;
  const { count, error } = await db.from("support_requests").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("user_unread", true);
  return error ? 0 : (count ?? 0);
}

/** Requests (own order, then newest) and folders of one person. */
export async function loadMyRequests(service, ownerId) {
  const [requests, folders] = await Promise.all([
    service.from("support_requests").select(REQUEST_COLUMNS).eq("owner_id", ownerId).order("position", { ascending: true }).order("last_message_at", { ascending: false }).limit(500),
    service.from("support_folders").select("id, name, position").eq("owner_id", ownerId).order("position", { ascending: true }),
  ]);
  if (isSchemaOutdated(requests.error) || isSchemaOutdated(folders.error)) return { outdated: true, requests: [], folders: [] };
  return {
    outdated: false,
    requests: (requests.data ?? []).map(shape),
    folders: (folders.data ?? []).map((row) => ({ id: row.id, name: row.name })),
  };
}

/**
 * One conversation of this person: the request, its messages (internal notes never reach a person, the policy and this
 * filter both say so) and signed links for the screenshots. Null when it is not theirs.
 */
export async function loadConversation(service, ownerId, requestId) {
  const found = await service.from("support_requests").select(REQUEST_COLUMNS).eq("id", String(requestId ?? "")).eq("owner_id", ownerId).maybeSingle();
  if (found.error || !found.data) return null;
  const messages = await service.from("support_messages").select("id, kind, body, created_at").eq("request_id", found.data.id).neq("kind", "note").order("created_at", { ascending: true }).limit(500);
  const rows = messages.data ?? [];
  const attachments = rows.length
    ? ((await service.from("support_attachments").select("id, message_id, path").in("message_id", rows.map((row) => row.id))).data ?? [])
    : [];
  const links = await screenshotLinks(service, attachments);
  return {
    request: shape(found.data),
    messages: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      at: row.created_at,
      screenshots: attachments.filter((a) => a.message_id === row.id && links[a.path]).map((a) => ({ id: a.id, url: links[a.path] })),
    })),
  };
}
