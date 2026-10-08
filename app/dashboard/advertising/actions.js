"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import {
  bookingErrorMessage,
  bookingsMissing,
  cleanCampaignName,
  cleanPlacementIds,
} from "../../../lib/booking-rules";

const MISSING = "Run migration 0009 in the Supabase SQL editor first.";

/**
 * Ask for a creative on one or more placements. Each placement becomes a booking
 * that waits for DeusADS and for the placement's developer. Advertisers (and
 * admins, who can try the flow) only; every id from the browser is re-checked.
 */
export async function createBooking({ campaignId, campaignName, creativeId, placementIds }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (me.role !== "advertiser" && me.role !== "admin") return { error: "Not allowed." };
  const { service, user } = me;

  const ids = cleanPlacementIds(placementIds);
  if (ids.length === 0) return { error: "Pick at least one placement." };

  const { data: creative } = await service
    .from("creatives")
    .select("id, status")
    .eq("id", String(creativeId ?? ""))
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!creative) return { error: "Pick one of your creatives." };
  if (creative.status !== "approved") return { error: "That creative has not been approved yet." };

  const { data: placements } = await service
    .from("placements")
    .select("id, owner_id")
    .in("id", ids)
    .is("removed_at", null);
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
    }))
  );
  if (error) return { error: "Could not send the requests. Try again." };

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true, count: fresh.length, skipped: placements.length - fresh.length };
}

/** Withdraw a booking; a live one stops showing at once. Only its advertiser can. */
export async function cancelBooking({ bookingId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const { error } = await me.service.rpc("cancel_booking", {
    p_booking: String(bookingId ?? ""),
    p_advertiser: me.user.id,
  });
  if (error) return { error: bookingErrorMessage(error) };

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true };
}
