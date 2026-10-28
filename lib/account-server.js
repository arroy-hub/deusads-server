// Server helpers shared by the account actions and the avatar route.

import { createClient } from "@supabase/supabase-js";
import { getMember } from "./admin.js";

export const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://deusads-server.vercel.app";

/**
 * Who is acting and on which account. With no target the caller acts on their own account; an admin may
 * name any other. Everyone else naming another account is refused. Returns { me, id, self } or { error }.
 */
export async function resolveActor(targetId) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const id = targetId ? String(targetId) : me.user.id;
  if (id === me.user.id) return { me, id, self: true };
  if (me.role !== "admin") return { error: "Not allowed." };
  return { me, id, self: false };
}

/** A throwaway anonymous client: it keeps nothing, so using it never touches the visitor's cookies. */
export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Is this the password of that account? Signing in creates a session, which is ended again at once so the
 * check leaves nothing behind in the person's list of devices.
 */
export async function passwordIsRight(email, password) {
  if (!email || !password) return false;
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: String(password) });
  if (error) return false;
  // scope "local": end only this throwaway session. The default ("global") would sign the person out everywhere,
  // including the browser they are changing the password in.
  await client.auth.signOut({ scope: "local" }).catch(() => null);
  return true;
}
