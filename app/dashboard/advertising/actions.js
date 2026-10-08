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

/**
 * Ask for a creative on one or more placements. Each placement becomes a booking
 * that waits for DeusADS and for the placement's developer. Advertisers (and
 * admins, who can try the flow) only; every id from the browser is re-checked.
 */
export async function createBooking({ campaignId, campaignName, creativeId, placementIds, startsOn, endsOn }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (me.role !== "advertiser" && me.role !== "admin") return { error: "Not allowed." };
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
  if (creative.status !== "approved") return { error: "That creative has not been approved yet." };

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
    .select("placement_id, creative_id, status")
    .in("placement_id", ids)
    .in("status", ["pending", "approved"]);
  if (bookingsMissing(takenError)) return { error: MISSING };
  if (takenError) return { error: "Could not save. Try again." };

  if ((taken ?? []).some((row) => row.status === "approved")) {
    return { error: "Some of those placements are already booked. Refresh the list." };
  }
  const requested = new Set(
    (taken ?? []).filter((row) => row.creative_id === creative.id).map((row) => row.placement_id)
  );
  const fresh = placements.filter((placement) => !requested.has(placement.id));
  if (fresh.length === 0) return { error: "You have already requested all of those placements with this creative." };

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

  const { error } = await service.from("bookings").insert(
    fresh.map((placement) => ({
      campaign_id: campaign.id,
      advertiser_id: user.id,
      developer_id: placement.owner_id,
      creative_id: creative.id,
      placement_id: placement.id,
      // The date columns come with migration 0013: only sent when dates were chosen.
      ...(dated ? { starts_on: range.startsOn, ends_on: range.endsOn } : {}),
    }))
  );
  if (isSchemaOutdated(error)) return { error: "Dates need migration 0013 in the Supabase SQL editor first." };
  if (error) return { error: "Could not send the requests. Try again." };

  // Each developer hears once, however many of their placements were asked for.
  await notifyMany(
    service,
    fresh.map((placement) => placement.owner_id),
    "New ad request waiting for your decision.",
    "/dashboard/requests"
  );

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true, count: fresh.length, skipped: placements.length - fresh.length };
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
  if (me.role !== "advertiser" && me.role !== "admin") return { error: "Not allowed." };

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
  if (me.role !== "advertiser" && me.role !== "admin") return { error: "Not allowed." };

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
