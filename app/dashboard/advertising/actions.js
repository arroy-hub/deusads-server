"use server";

import { revalidatePath } from "next/cache";
import { isSchemaOutdated } from "../../../lib/api";
import { getMember } from "../../../lib/admin";
import {
  bookingErrorMessage,
  bookingsMissing,
  cleanCampaignName,
  cleanPlacementIds,
  parseDateRange,
} from "../../../lib/booking-rules";
import { describeBooking } from "../../../lib/bookings-data";
import { notify, notifyMany } from "../../../lib/notify";

const MISSING = "Run migration 0009 in the Supabase SQL editor first.";
const ACTIVATE_MISSING = "Run migration 0015 in the Supabase SQL editor first.";

/**
 * Book a creative on one or more placements. Bookings are approved automatically by
 * the database function activate_booking (migration 0015): the placement must be open,
 * the developer must not have blocked the advertiser, the creative or its category, and
 * restricted categories need the developer's opt-in. A booking whose creative is still
 * in review waits and starts by itself when the creative is approved. Advertisers only;
 * every id from the browser is re-checked.
 */
export async function createBooking({ campaignId, campaignName, creativeId, placementIds, startsOn, endsOn }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (me.role !== "advertiser") return { error: "Not allowed." };
  const { service, user } = me;

  const ids = cleanPlacementIds(placementIds);
  if (ids.length === 0) return { error: "Pick at least one placement." };

  const range = parseDateRange(startsOn, endsOn);
  if (range.error) return { error: range.error };
  const dated = Boolean(range.startsOn || range.endsOn);

  const { data: creative } = await service
    .from("creatives")
    .select("id, status")
    .eq("id", String(creativeId ?? ""))
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!creative) return { error: "Pick one of your creatives." };
  if (creative.status === "rejected") return { error: "That creative was rejected. Upload another one." };

  const lookup = (columns) => service.from("placements").select(columns).in("id", ids).is("removed_at", null);
  let { data: placements, error: placementsError } = await lookup("id, owner_id, open_to_advertisers");
  // Before migration 0014 there is no switch: every live placement can be requested.
  if (placementsError) ({ data: placements } = await lookup("id, owner_id"));
  else if ((placements ?? []).some((placement) => !placement.open_to_advertisers)) {
    return { error: "Some of those placements are not open to advertisers." };
  }
  if ((placements ?? []).length !== ids.length) return { error: "Some of those placements are no longer available." };
  if (placements.some((placement) => placement.owner_id === user.id)) {
    return { error: "You cannot book a placement in your own game." };
  }

  const { data: taken, error: takenError } = await service
    .from("bookings")
    .select("placement_id")
    .in("placement_id", ids)
    .eq("creative_id", creative.id)
    .in("status", ["pending", "approved"]);
  if (bookingsMissing(takenError)) return { error: MISSING };
  if (takenError) return { error: "Could not save. Try again." };

  const requested = new Set((taken ?? []).map((row) => row.placement_id));
  const fresh = placements.filter((placement) => !requested.has(placement.id));
  if (fresh.length === 0) return { error: "This creative is already booked on all of those placements." };

  let campaign;
  if (campaignId) {
    const { data } = await service
      .from("campaigns")
      .select("id")
      .eq("id", String(campaignId))
      .eq("advertiser_id", user.id)
      .maybeSingle();
    campaign = data;
    if (!campaign) return { error: "Unknown campaign." };
  } else {
    const name = cleanCampaignName(campaignName);
    if (!name) return { error: "Name the campaign." };
    const { data, error } = await service
      .from("campaigns")
      .insert({ advertiser_id: user.id, name })
      .select("id")
      .single();
    if (bookingsMissing(error)) return { error: MISSING };
    if (error || !data) return { error: "Could not create the campaign." };
    campaign = data;
  }

  const { data: created, error } = await service
    .from("bookings")
    .insert(
      fresh.map((placement) => ({
        campaign_id: campaign.id,
        advertiser_id: user.id,
        developer_id: placement.owner_id,
        creative_id: creative.id,
        placement_id: placement.id,
        // The date columns come with migration 0013: only sent when dates were chosen.
        ...(dated ? { starts_on: range.startsOn, ends_on: range.endsOn } : {}),
      }))
    )
    .select("id, developer_id");
  if (isSchemaOutdated(error)) return { error: "Dates need migration 0013 in the Supabase SQL editor first." };
  if (error?.code === "23505") return { error: "This creative is already booked on one of those placements. Refresh the list." };
  if (error) return { error: "Could not send the requests. Try again." };

  // Approve what can be approved now. Each call is independent; one failing does not stop the rest.
  const outcome = { approved: 0, waiting: 0, rejected: 0 };
  const goingLive = [];
  for (const booking of created ?? []) {
    const { data: status, error: activateError } = await service.rpc("activate_booking", { p_booking: booking.id });
    if (activateError) {
      if (["PGRST202", "42883"].includes(activateError.code)) return { error: ACTIVATE_MISSING };
      outcome.waiting += 1; // stays pending; it is retried when the creative is reviewed
      continue;
    }
    if (status === "approved") {
      outcome.approved += 1;
      goingLive.push(booking.developer_id);
    } else if (status === "rejected" || status === "cancelled") outcome.rejected += 1;
    else outcome.waiting += 1;
  }

  // Each developer hears once, however many of their placements were booked.
  await notifyMany(
    service,
    goingLive,
    "A new ad is showing in your game. You can switch it off in Now showing.",
    "/dashboard/requests"
  );

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true, count: fresh.length, skipped: placements.length - fresh.length, ...outcome };
}

/** Withdraw a booking; a live one stops showing at once. Only its advertiser can. */
export async function cancelBooking({ bookingId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const id = String(bookingId ?? "");
  const info = await describeBooking(me.service, id);
  const { error } = await me.service.rpc("cancel_booking", { p_booking: id, p_advertiser: me.user.id });
  if (error) return { error: bookingErrorMessage(error) };

  if (info && info.advertiserId === me.user.id) {
    await notify(me.service, {
      accountId: info.developerId,
      text: `The advertiser withdrew their booking on ${info.where}.`,
      link: "/dashboard/requests",
    });
  }

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true };
}

/** Rename one of the caller's own campaigns. */
export async function renameCampaign({ campaignId, name }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (me.role !== "advertiser") return { error: "Not allowed." };

  const title = cleanCampaignName(name);
  if (!title) return { error: "Name the campaign." };

  const { data, error } = await me.service
    .from("campaigns")
    .update({ name: title })
    .eq("id", String(campaignId ?? ""))
    .eq("advertiser_id", me.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Could not rename the campaign." };

  revalidatePath("/dashboard/advertising");
  return { ok: true, name: title };
}

/**
 * Delete one of the caller's own campaigns. Refused while any booking in it is
 * still open (pending, or approved and not ended): withdraw or stop those first,
 * so deleting never silently takes a live creative off a developer's placement.
 * The campaign's closed bookings go with it, and so does their share of the reports.
 */
export async function deleteCampaign({ campaignId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (me.role !== "advertiser") return { error: "Not allowed." };

  const id = String(campaignId ?? "");
  const { data: campaign } = await me.service
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("advertiser_id", me.user.id)
    .maybeSingle();
  if (!campaign) return { error: "Unknown campaign." };

  await me.service.rpc("sync_booking_schedule"); // bookings past their end date are closed first
  const { count, error: openError } = await me.service
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .in("status", ["pending", "approved"]);
  if (openError) return { error: "Could not check the campaign. Try again." };
  if ((count ?? 0) > 0) return { error: "Withdraw or stop its open bookings first." };

  const { error } = await me.service.from("campaigns").delete().eq("id", id).eq("advertiser_id", me.user.id);
  if (error) return { error: "Could not delete the campaign." };

  revalidatePath("/dashboard/advertising");
  return { ok: true };
}
