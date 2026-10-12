"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";

/** Hide "Since your last visit" until the next visit. */
export async function dismissDigest() {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const { error } = await me.service.from("accounts").update({ digest_dismissed_at: new Date().toISOString() }).eq("id", me.user.id);
  if (error) return { error: "Could not save." };
  revalidatePath("/dashboard/games");
  return { ok: true };
}
