// Reads for the account page. Every function takes a client that is already allowed to see the account
// (the caller has been checked: the owner, or an admin) and answers plain, serialisable data.
// Columns from migration 0030 are optional: without it the page still opens, with those fields empty.

import { isSchemaOutdated } from "./api.js";
import { runningCampaignIds } from "./account-rules.js";
import { resolvePrefs } from "./notification-prefs.js";

const BASE = "id, email, company, role, created_at, suspended_at";
const FULL = `${BASE}, contact_name, avatar_path, website, country, phone, password_changed_at`;

/** The accounts row, with the 0030 columns when the database has them. `outdated` says it does not. */
export async function loadAccountRow(service, id) {
  const first = await service.from("accounts").select(FULL).eq("id", id).maybeSingle();
  if (!isSchemaOutdated(first.error)) return { row: first.data ?? null, outdated: false };
  const second = await service.from("accounts").select(BASE).eq("id", id).maybeSingle();
  return { row: second.data ?? null, outdated: true };
}

/** Public URL of an avatar (the picture lives in the owner's folder of the creatives bucket), or null. */
export function avatarUrlOf(db, path) {
  if (!path) return null;
  return db.storage.from("creatives").getPublicUrl(path).data.publicUrl;
}

/** The names of an account's games and how many of its campaigns are showing now. */
export async function loadOwned(service, id, today = new Date().toISOString().slice(0, 10)) {
  const [games, first] = await Promise.all([
    service.from("games").select("name").eq("owner_id", id).order("created_at", { ascending: true }),
    service.from("bookings").select("id, campaign_id, status, starts_on, ends_on").eq("advertiser_id", id).eq("status", "approved"),
  ]);
  let bookings = first.data;
  if (isSchemaOutdated(first.error)) ({ data: bookings } = await service.from("bookings").select("id, status").eq("advertiser_id", id).eq("status", "approved"));
  return { games: (games.data ?? []).map((game) => game.name), runningCampaigns: runningCampaignIds(bookings, today).size };
}

/** The stored notification choices of an account (none before migration 0030). */
export async function loadPrefRows(service, id) {
  const { data, error } = await service.from("notification_prefs").select("type, bell, email").eq("account_id", id);
  return error ? [] : (data ?? []);
}

/** The address an email change is waiting for, or null. */
export async function loadPendingEmail(service, id) {
  try {
    const { data } = await service.auth.admin.getUserById(id);
    return data?.user?.new_email || null;
  } catch {
    return null;
  }
}

/** The id of the session in use, read from the access token (it is the session_id claim). */
export async function currentSessionId(db) {
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

/** The person's own sessions, newest activity first; [] before migration 0030. */
export async function loadSessions(db) {
  const [{ data, error }, current] = await Promise.all([db.rpc("my_sessions"), currentSessionId(db)]);
  if (error) return [];
  return (data ?? []).map((row) => ({ id: row.id, userAgent: row.user_agent ?? "", lastSeen: row.last_seen, current: row.id === current }));
}

/**
 * Everything the account page shows for one account. `db` is the user's own client (for their sessions, only
 * when `self`); `service` reads the rest.
 */
export async function loadAccountView({ service, db, id, self }) {
  const { row, outdated } = await loadAccountRow(service, id);
  if (!row) return null;
  const [owned, prefRows, pendingEmail, sessions] = await Promise.all([
    loadOwned(service, id),
    loadPrefRows(service, id),
    loadPendingEmail(service, id),
    self ? loadSessions(db) : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    role: row.role,
    email: row.email ?? "",
    company: row.company ?? "",
    contactName: row.contact_name ?? "",
    website: row.website ?? "",
    country: row.country ?? "",
    phone: row.phone ?? "",
    avatarUrl: avatarUrlOf(service, row.avatar_path),
    createdAt: row.created_at,
    suspended: Boolean(row.suspended_at),
    passwordChangedAt: row.password_changed_at ?? null,
    pendingEmail,
    games: owned.games,
    runningCampaigns: owned.runningCampaigns,
    prefs: resolvePrefs(row.role, prefRows),
    sessions,
    schemaOutdated: outdated,
  };
}
