import { userClient } from "./supabase-server";
import { serviceClient } from "./api";

/**
 * The signed-in admin and a service-role client for the privileged work, or null
 * for anyone else.
 *
 * The role is read through the user's own client: accounts.role cannot be edited
 * by users (column grants, migration 0004), so a user cannot make themselves an
 * admin. The service client bypasses row-level security, so it is handed out only
 * after this check and only to server code.
 */
export async function getAdmin() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  const user = data?.user;
  if (!user) return null;

  const { data: account } = await db.from("accounts").select("role").eq("id", user.id).maybeSingle();
  if (account?.role !== "admin") return null;

  return { user, service: serviceClient() };
}

/** The signed-in user's role ("developer" when there is no account row yet). */
export async function currentRole(db, userId) {
  if (!userId) return null;
  const { data } = await db.from("accounts").select("role").eq("id", userId).maybeSingle();
  return data?.role ?? "developer";
}

/**
 * The signed-in user with their role and a service-role client, or null when
 * signed out. Unlike getAdmin this is for every role, so the service client is
 * only for work the caller has already been checked for: scope every query to the
 * caller's own id, or to what their role is allowed to see.
 */
export async function getMember() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  const user = data?.user;
  if (!user) return null;
  const { data: account } = await db.from("accounts").select("role, suspended_at").eq("id", user.id).maybeSingle();
  // suspended_at comes with migration 0015: before it the column is missing and nobody is suspended.
  if (account?.suspended_at) return null;
  const role = account?.role ?? (await currentRole(db, user.id));
  return { user, role, service: serviceClient() };
}
