"use server";

import { isSchemaOutdated } from "../../lib/api";
import { getMember } from "../../lib/admin";
import { DECK_KINDS, cleanLayout } from "../../lib/deck-layout";

/** Saves how the person arranged their widget board; it is the same on every device they sign in on. */
export async function saveDeckLayout({ kind, layout }) {
  if (!DECK_KINDS.includes(kind)) return { error: "Unknown board." };
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const { error } = await me.service
    .from("dashboard_layouts")
    .upsert({ account_id: me.user.id, kind, layout: cleanLayout(layout), updated_at: new Date().toISOString() }, { onConflict: "account_id,kind" });
  if (error) return { error: isSchemaOutdated(error) ? "The database needs update 0042 first." : "Could not save the layout." };
  return { ok: true };
}
