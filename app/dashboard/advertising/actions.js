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
import { canAdvertise } from "../../../lib/admin-rules";
import { parseTargeting } from "../../../lib/targeting";
import { syncCampaign } from "../../../lib/campaign-sync";

const MISSING = "Run migration 0009 in the Supabase SQL editor first.";
const ACTIVATE_MISSING = "Run migration 0015 in the Supabase SQL editor first.";
const RULES_MISSING = "Run migration 0026 in the Supabase SQL editor first.";

/**
 * Book a creative on one or more placements. Bookings are approved automatically by
 * the database function activate_booking (migration 0015): the placement must be open,
 * the developer must not have blocked the advertiser, the creative or its category, and
 * restricted categories need the developer's opt-in. A booking whose creative is still
 * in review waits and starts by itself when the creative is approved. Advertisers only;
 * every id from the browser is re-checked.
 */
export async function createBooking({ campaignId, campaignName, creativeId, placementIds, startsOn, endsOn, targeting }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
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
  // An admin may book in their own games, to try both sides of the platform with one account.
  if (me.role !== "admin" && placements.some((placement) => placement.owner_id === user.id)) {
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

  // The audience chosen for the campaign (migration 0026); empty means every game. Without the migration it is not stored.
  const audience = targeting === undefined ? undefined : parseTargeting(targeting);
  if (audience?.error) return { error: audience.error };

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
    if (audience) {
      const stored = await service.from("campaigns").update({ targeting: audience.value }).eq("id", campaign.id);
      if (stored.error && !isSchemaOutdated(stored.error)) return { error: "Could not save the audience. Try again." };
    }
  } else {
    const name = cleanCampaignName(campaignName);
    if (!name) return { error: "Name the campaign." };
    let { data, error } = await service
      .from("campaigns")
      .insert({ advertiser_id: user.id, name, ...(audience ? { targeting: audience.value } : {}) })
      .select("id")
      .single();
    // Before migration 0026 a campaign has no audience of its own: it is created without one.
    if (audience && isSchemaOutdated(error)) {
      ({ data, error } = await service.from("campaigns").insert({ advertiser_id: user.id, name }).select("id").single());
    }
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

  // A saved draft has become a running campaign: its plan is no longer needed (migration 0026; harmless without it).
  await service.from("campaigns").update({ plan: null }).eq("id", campaign.id);

  // Each developer hears once, however many of their placements were booked.
  await notifyMany(
    service,
    goingLive,
    "A new ad is showing in your game. You can pause or block it in the game's Campaigns tab.",
    "/dashboard/games"
  );

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true, count: fresh.length, skipped: placements.length - fresh.length, ...outcome };
}

/**
 * Start a campaign by audience. The campaign remembers who it is for, which creative runs and when, and books every
 * open placement in a game that fits, now and whenever such a placement appears. With no matching game yet it simply
 * waits (status Waiting). Advertisers only; the creative must be theirs and not rejected.
 */
export async function launchCampaign({ campaignId, campaignName, creativeId, targeting, startsOn, endsOn }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const { service, user } = me;

  const range = parseDateRange(startsOn, endsOn);
  if (range.error) return { error: range.error };
  const audience = parseTargeting(targeting ?? null);
  if (audience.error) return { error: audience.error };

  const { data: creative } = await service.from("creatives").select("id, status").eq("id", String(creativeId ?? "")).eq("owner_id", user.id).maybeSingle();
  if (!creative) return { error: "Pick one of your creatives." };
  if (creative.status === "rejected") return { error: "That creative was rejected. Upload another one." };

  const plan = { creativeId: creative.id, mode: "audience", placementIds: [], startsOn: range.startsOn ?? "", endsOn: range.endsOn ?? "", launched: true };
  let id = "";
  if (campaignId) {
    const campaign = await ownCampaign(me, campaignId);
    if (!campaign) return { error: "Unknown campaign." };
    const fields = { targeting: audience.value, plan };
    const name = cleanCampaignName(campaignName);
    if (name) fields.name = name;
    const { error } = await service.from("campaigns").update(fields).eq("id", campaign.id);
    if (isSchemaOutdated(error)) return { error: RULES_MISSING };
    if (error) return { error: "Could not start the campaign. Try again." };
    id = campaign.id;
  } else {
    const name = cleanCampaignName(campaignName);
    if (!name) return { error: "Name the campaign." };
    const { data, error } = await service.from("campaigns").insert({ advertiser_id: user.id, name, targeting: audience.value, plan }).select("id").single();
    if (isSchemaOutdated(error)) return { error: RULES_MISSING };
    if (bookingsMissing(error)) return { error: MISSING };
    if (error || !data) return { error: "Could not create the campaign." };
    id = data.id;
  }

  const result = await syncCampaign(service, id).catch(() => ({ skipped: "error" }));
  revalidatePath("/dashboard", "layout");
  return { ok: true, id, booked: result.booked ?? 0, waiting: result.waiting ?? 0 };
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
      link: "/dashboard/games",
    });
  }

  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true };
}

/** Rename one of the caller's own campaigns. */
export async function renameCampaign({ campaignId, name }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };

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
  if (!canAdvertise(me.role)) return { error: "Not allowed." };

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

/**
 * Take a creative out of one campaign: its open bookings there are withdrawn (a live one stops at once). The creative stays
 * in the library and in other campaigns.
 */
export async function removeCreativeFromCampaign({ campaignId, creativeId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };

  const { data: open, error } = await me.service
    .from("bookings")
    .select("id")
    .eq("advertiser_id", me.user.id)
    .eq("campaign_id", String(campaignId ?? ""))
    .eq("creative_id", String(creativeId ?? ""))
    .in("status", ["pending", "approved"]);
  if (error) return { error: "Could not read the bookings. Try again." };
  for (const booking of open ?? []) {
    const { error: cancelError } = await me.service.rpc("cancel_booking", { p_booking: booking.id, p_advertiser: me.user.id });
    if (cancelError) return { error: bookingErrorMessage(cancelError) };
  }
  revalidatePath("/dashboard/advertising");
  return { ok: true, count: (open ?? []).length };
}

/** Change the dates of every open booking in one of the caller's campaigns (migration 0013). Empty means no start or no end. */
export async function setCampaignDates({ campaignId, startsOn, endsOn }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };

  const id = String(campaignId ?? "");
  const { data: campaign } = await me.service.from("campaigns").select("id").eq("id", id).eq("advertiser_id", me.user.id).maybeSingle();
  if (!campaign) return { error: "Unknown campaign." };

  // A campaign that already started keeps its start date; only a new start date must not be in the past.
  const { data: open } = await me.service.from("bookings").select("starts_on").eq("campaign_id", id).eq("advertiser_id", me.user.id).in("status", ["pending", "approved"]);
  const current = (open ?? []).map((row) => row.starts_on).filter(Boolean).sort()[0] ?? null;
  const kept = String(startsOn ?? "").trim();
  const range = parseDateRange(startsOn, endsOn, kept && kept === current ? kept : undefined);
  if (range.error) return { error: range.error };

  const { error } = await me.service
    .from("bookings")
    .update({ starts_on: range.startsOn, ends_on: range.endsOn })
    .eq("campaign_id", id)
    .eq("advertiser_id", me.user.id)
    .in("status", ["pending", "approved"]);
  if (isSchemaOutdated(error)) return { error: "Dates need migration 0013 in the Supabase SQL editor first." };
  if (error) return { error: "Could not change the dates. Try again." };
  await me.service.rpc("sync_booking_schedule");

  revalidatePath("/dashboard/advertising");
  return { ok: true };
}

/** One of the caller's own campaigns, or null. */
async function ownCampaign(me, campaignId) {
  const { data } = await me.service
    .from("campaigns")
    .select("id, name")
    .eq("id", String(campaignId ?? ""))
    .eq("advertiser_id", me.user.id)
    .maybeSingle();
  return data ?? null;
}

/** Pause a whole campaign (or let it run again): it stops being served everywhere, players see the change at their next launch. */
export async function pauseCampaign({ campaignId, paused }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const campaign = await ownCampaign(me, campaignId);
  if (!campaign) return { error: "Unknown campaign." };

  const { error } = await me.service
    .from("campaigns")
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq("id", campaign.id);
  if (isSchemaOutdated(error)) return { error: RULES_MISSING };
  if (error) return { error: "Could not change the campaign. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, paused: Boolean(paused) };
}

/** Set the audience of a campaign: genres, platforms, languages and genres to skip. Nothing picked means every game. */
export async function setCampaignAudience({ campaignId, targeting }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const campaign = await ownCampaign(me, campaignId);
  if (!campaign) return { error: "Unknown campaign." };

  const parsed = parseTargeting(targeting);
  if (parsed.error) return { error: parsed.error };
  const { error } = await me.service.from("campaigns").update({ targeting: parsed.value }).eq("id", campaign.id);
  if (isSchemaOutdated(error)) return { error: RULES_MISSING };
  if (error) return { error: "Could not save. Try again." };

  // A campaign started by audience books the games that now fit.
  await syncCampaign(me.service, campaign.id).catch(() => null);
  revalidatePath("/dashboard", "layout");
  return { ok: true, targeting: parsed.value };
}

/** Stop a campaign running in one game, or let it run there again. Only games the campaign has placements in. */
export async function excludeGame({ campaignId, gameId, excluded }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const campaign = await ownCampaign(me, campaignId);
  if (!campaign) return { error: "Unknown campaign." };

  const game = String(gameId ?? "");
  const { data: placements } = await me.service.from("placements").select("id").eq("game_id", game);
  const { count } = placements?.length
    ? await me.service.from("bookings").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("placement_id", placements.map((row) => row.id))
    : { count: 0 };
  if (!count) return { error: "This campaign has no placements in that game." };

  const result = excluded
    ? await me.service.from("campaign_excluded_games").upsert({ campaign_id: campaign.id, game_id: game })
    : await me.service.from("campaign_excluded_games").delete().eq("campaign_id", campaign.id).eq("game_id", game);
  if (result.error) return { error: isSchemaOutdated(result.error) || result.error.code === "42P01" ? RULES_MISSING : "Could not change the campaign. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** What a draft remembers: the creative, how placements were chosen, the filters and the placements picked by hand. */
function cleanPlan(plan, ownCreativeIds) {
  const creativeId = ownCreativeIds.has(String(plan?.creativeId ?? "")) ? String(plan.creativeId) : null;
  const mode = plan?.mode === "manual" ? "manual" : "audience";
  return { creativeId, mode, placementIds: cleanPlacementIds(plan?.placementIds ?? []), startsOn: "", endsOn: "" };
}

/**
 * Save a campaign before it is started: its name, audience and the choices made so far. It shows in the list as a Draft
 * and opens in the wizard where it was left. Creates the campaign, or updates the draft when `campaignId` is given.
 */
export async function saveDraft({ campaignId, campaignName, targeting, plan }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };

  const name = cleanCampaignName(campaignName);
  if (!name) return { error: "Name the campaign." };
  const audience = parseTargeting(targeting ?? null);
  if (audience.error) return { error: audience.error };

  const { data: mine } = await me.service.from("creatives").select("id").eq("owner_id", me.user.id);
  const fields = { name, targeting: audience.value, plan: cleanPlan(plan, new Set((mine ?? []).map((row) => row.id))) };

  if (campaignId) {
    const campaign = await ownCampaign(me, campaignId);
    if (!campaign) return { error: "Unknown campaign." };
    const { error } = await me.service.from("campaigns").update(fields).eq("id", campaign.id);
    if (isSchemaOutdated(error)) return { error: RULES_MISSING };
    if (error) return { error: "Could not save the draft. Try again." };
    revalidatePath("/dashboard/advertising");
    return { ok: true, campaignId: campaign.id };
  }

  const { data, error } = await me.service.from("campaigns").insert({ advertiser_id: me.user.id, ...fields }).select("id").single();
  if (isSchemaOutdated(error)) return { error: RULES_MISSING };
  if (bookingsMissing(error)) return { error: MISSING };
  if (error || !data) return { error: "Could not save the draft. Try again." };
  revalidatePath("/dashboard/advertising");
  return { ok: true, campaignId: data.id };
}

/**
 * Copy a campaign into a new draft: the same audience, creative and placements, no dates. Nothing starts until the
 * copy is finished in the wizard.
 */
export async function duplicateCampaign({ campaignId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const campaign = await ownCampaign(me, campaignId);
  if (!campaign) return { error: "Unknown campaign." };

  const { data: bookings } = await me.service
    .from("bookings")
    .select("creative_id, placement_id, status, created_at")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: false });
  const rows = bookings ?? [];
  const usable = rows.filter((row) => row.status === "approved" || row.status === "pending" || row.status === "ended");
  const source = usable.length ? usable : rows;
  const creativeId = source[0]?.creative_id ?? null;
  const placementIds = [...new Set(source.filter((row) => row.creative_id === creativeId).map((row) => row.placement_id))];

  const copy = { advertiser_id: me.user.id, name: cleanCampaignName(`${campaign.name} (copy)`) || "Copy", plan: { creativeId, mode: "manual", placementIds, startsOn: "", endsOn: "" } };
  const { data: original } = await me.service.from("campaigns").select("targeting").eq("id", campaign.id).maybeSingle();
  if (original?.targeting) copy.targeting = original.targeting;

  const { data, error } = await me.service.from("campaigns").insert(copy).select("id").single();
  if (isSchemaOutdated(error)) return { error: RULES_MISSING };
  if (error || !data) return { error: "Could not copy the campaign. Try again." };
  revalidatePath("/dashboard/advertising");
  return { ok: true, campaignId: data.id };
}
