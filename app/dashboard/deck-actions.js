"use server";

import { isSchemaOutdated } from "../../lib/api";
import { getMember } from "../../lib/admin";
import { loadDeckModel } from "../../lib/advertiser-data";
import { canAdvertise } from "../../lib/admin-rules";
import { parseRange } from "../../lib/reports";
import { isDeckKind, cleanLayout } from "../../lib/deck-layout";

/** Saves how the person arranged their widget board; it is the same on every device they sign in on. */
export async function saveDeckLayout({ kind, layout }) {
  if (!isDeckKind(kind)) return { error: "Unknown board." };
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (kind.startsWith("admin_") && me.role !== "admin") return { error: "Not allowed." };
  const { error } = await me.service
    .from("dashboard_layouts")
    .upsert({ account_id: me.user.id, kind, layout: cleanLayout(layout), updated_at: new Date().toISOString() }, { onConflict: "account_id,kind" });
  if (error) return { error: isSchemaOutdated(error) ? "The database needs update 0042 first." : "Could not save the layout." };
  return { ok: true };
}

/** The widgets' figures for the advertiser's Overview (all campaigns), fetched after the page is shown. */
export async function loadOverviewDeck({ days }) {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) return null;
  try {
    return await loadDeckModel(me.service, me, parseRange(String(days)));
  } catch {
    return null;
  }
}
