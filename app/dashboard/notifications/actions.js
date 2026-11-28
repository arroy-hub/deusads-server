"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import { markSeen } from "../../../lib/attention-seen";

/** Marks the caller's own unread notifications as read. */
export async function markAllRead(ids = null) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  // `ids`: only these (an admin's bell shows the part of one role, and marks that part)
  const only = Array.isArray(ids) ? ids.filter((id) => typeof id === "string").slice(0, 200) : null;
  if (only && !only.length) return { ok: true };
  let query = me.service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("account_id", me.user.id)
    .is("read_at", null);
  if (only) query = query.in("id", only);
  const { error } = await query;
  if (error) return { error: "Could not update. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Marks one of the caller's own notifications as read: the person opened it, so it leaves the bell. Nothing else changes. */
export async function markRead(id) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!id) return { error: "Nothing to mark." };

  const { error } = await me.service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", me.user.id)
    .is("read_at", null);
  if (error) return { error: "Could not update. Try again." };
  return { ok: true };
}

/** The caller opened an item of 'Needs action': it leaves the bell and the counter goes down (until it changes). */
export async function markAttentionSeen(sig) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  return markSeen(me.service, me.user.id, [sig]);
}
