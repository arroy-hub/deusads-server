"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";

/** Marks the caller's own unread notifications as read. */
export async function markAllRead() {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const { error } = await me.service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("account_id", me.user.id)
    .is("read_at", null);
  if (error) return { error: "Could not update. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
