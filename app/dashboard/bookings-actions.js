"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../lib/admin";
import { cleanNote } from "../../lib/admin-rules";
import { isSchemaOutdated } from "../../lib/api";
import { bookingErrorMessage } from "../../lib/booking-rules";
import { isCategory } from "../../lib/categories";
import { describeBooking } from "../../lib/bookings-data";
import { notify } from "../../lib/notify";

function refresh() {
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  revalidatePath("/dashboard/advertising");
}

const MISSING = "Run migration 0015 in the Supabase SQL editor first.";

/** Stops every live booking of this developer that matches, so a block takes effect at once. */
async function stopMatching(service, developerId, match, note) {
  const { data: rows } = await service
    .from("bookings")
    .select("id, advertiser_id, creative_id")
    .eq("developer_id", developerId)
    .in("status", ["pending", "approved"]);
  let stopped = 0;
  for (const row of rows ?? []) {
    if (!(await match(row))) continue;
    const { error } = await service.rpc("stop_booking", { p_booking: row.id, p_developer: developerId, p_note: note });
    if (!error) stopped += 1;
  }
  return stopped;
}

/** The developer takes a live booking off their own placement. */
export async function stopBooking({ bookingId, note }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const { error } = await me.service.rpc("stop_booking", {
    p_booking: String(bookingId ?? ""),
    p_developer: me.user.id,
    p_note: cleanNote(note),
  });
  if (error) return { error: bookingErrorMessage(error) };

  const info = await describeBooking(me.service, String(bookingId ?? ""));
  if (info) {
    await notify(me.service, {
      accountId: info.advertiserId,
      text: `The developer stopped your booking on ${info.where}${cleanNote(note) ? `: ${cleanNote(note)}` : "."}`,
      link: "/dashboard/advertising",
    });
  }

  refresh();
  return { ok: true };
}

/**
 * Block an advertiser, one creative or a whole ad category in all of the caller's games.
 * Their live ads of that kind stop now and new bookings of it are refused by the database.
 * kind: "advertiser" | "creative" | "category"; target is the id (or category id).
 */
export async function blockAds({ kind, target }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const id = String(target ?? "");
  if (!id) return { error: "Nothing to block." };

  const row = { developer_id: me.user.id, kind };
  let match;
  if (kind === "advertiser") {
    row.advertiser_id = id;
    match = (booking) => booking.advertiser_id === id;
  } else if (kind === "creative") {
    row.creative_id = id;
    match = (booking) => booking.creative_id === id;
  } else if (kind === "category") {
    if (!isCategory(id)) return { error: "Unknown category." };
    row.category = id;
    const { data: creatives } = await me.service.from("creatives").select("id").eq("ad_category", id);
    const inCategory = new Set((creatives ?? []).map((creative) => creative.id));
    match = (booking) => inCategory.has(booking.creative_id);
  } else {
    return { error: "Unknown block." };
  }

  const { error } = await me.service.from("developer_blocks").insert(row);
  if (isSchemaOutdated(error) || error?.code === "42P01") return { error: MISSING };
  // Already blocked is fine: the goal is the same.
  if (error && error.code !== "23505") return { error: "Could not save the block." };

  const stopped = await stopMatching(me.service, me.user.id, match, "Blocked by the developer");
  refresh();
  return { ok: true, stopped };
}

/** Remove one of the caller's blocks. */
export async function unblockAds({ blockId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const { error } = await me.service
    .from("developer_blocks")
    .delete()
    .eq("id", String(blockId ?? ""))
    .eq("developer_id", me.user.id);
  if (error) return { error: "Could not remove the block." };
  refresh();
  return { ok: true };
}

/** Opt in (or out) of ads in restricted categories for all of the caller's games. */
export async function setAllowRestricted({ allow }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const { error } = await me.service
    .from("accounts")
    .update({ allow_restricted: Boolean(allow) })
    .eq("id", me.user.id);
  if (isSchemaOutdated(error)) return { error: MISSING };
  if (error) return { error: "Could not save." };
  refresh();
  return { ok: true, allow: Boolean(allow) };
}
