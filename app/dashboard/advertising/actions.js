"use server";

import { revalidatePath } from "next/cache";
import { isSchemaOutdated } from "../../../lib/api";
import { getMember } from "../../../lib/admin";
import { coverValue, parseCover } from "../../../lib/game-cover";
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
import { isCategory } from "../../../lib/categories";
import { syncCampaign } from "../../../lib/campaign-sync";
import { addToPlan, planCreativeIds, removeFromPlan } from "../../../lib/campaign-plan";

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
    "/dashboard/games",
    "dev_campaign"
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
export async function launchCampaign({ campaignId, campaignName, creativeId, creativeIds, category, targeting, startsOn, endsOn }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const { service, user } = me;

  const range = parseDateRange(startsOn, endsOn);
  if (range.error) return { error: range.error };
  const audience = parseTargeting(targeting ?? null);
  if (audience.error) return { error: audience.error };

  // One or several creatives from the library; the first is the campaign's main one.
  const wanted = [...new Set([...(Array.isArray(creativeIds) ? creativeIds : []), creativeId].map((id) => String(id ?? "")).filter(Boolean))].slice(0, 20);
  if (wanted.length === 0) return { error: "Pick one of your creatives." };
  const { data: found } = await service.from("creatives").select("id, status").in("id", wanted).eq("owner_id", user.id);
  if ((found ?? []).length !== wanted.length) return { error: "Pick your own creatives." };
  if ((found ?? []).some((creative) => creative.status === "rejected")) return { error: "A rejected creative cannot run. Upload another one." };
  if (category && !isCategory(category)) return { error: "Choose one of the categories." };

  const plan = addToPlan({ mode: "audience", placementIds: [], startsOn: range.startsOn ?? "", endsOn: range.endsOn ?? "", launched: true }, wanted);
  let id = "";
  if (campaignId) {
    const campaign = await ownCampaign(me, campaignId);
    if (!campaign) return { error: "Unknown campaign." };
    const fields = { targeting: audience.value, plan };
    const name = cleanCampaignName(campaignName);
    if (name) fields.name = name;
    let { error } = await service.from("campaigns").update(category ? { ...fields, category } : fields).eq("id", campaign.id);
    // Before migration 0048 a campaign has no category of its own: it is started without one.
    if (category && isSchemaOutdated(error)) ({ error } = await service.from("campaigns").update(fields).eq("id", campaign.id));
    if (isSchemaOutdated(error)) return { error: RULES_MISSING };
    if (error) return { error: "Could not start the campaign. Try again." };
    id = campaign.id;
  } else {
    const name = cleanCampaignName(campaignName);
    if (!name) return { error: "Name the campaign." };
    const row = { advertiser_id: user.id, name, targeting: audience.value, plan };
    let { data, error } = await service.from("campaigns").insert(category ? { ...row, category } : row).select("id").single();
    if (category && isSchemaOutdated(error)) ({ data, error } = await service.from("campaigns").insert(row).select("id").single());
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
      type: "dev_withdrew",
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
 * Sets the picture behind a campaign's page and card: a colour ("preset:<id>"), a picture the browser has already put in
 * Storage inside the caller's own folder (`path`), or nothing (back to the first creative's picture). Deletes the
 * previous picture. Needs migration 0044.
 */
export async function setCampaignCover({ campaignId, preset = null, path = null }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const id = String(campaignId ?? "");

  let next = null;
  if (path) {
    const file = String(path);
    if (!file.startsWith(`${me.user.id}/`) || file.includes("..") || file.length > 290) return { error: "Upload failed. Try again." };
    next = `image:${file}`;
  } else if (preset) {
    next = coverValue(`preset:${String(preset)}`);
    if (next === undefined) return { error: "That colour is not one of the choices." };
  }

  const drop = () => (path ? me.service.storage.from("creatives").remove([String(path)]) : null);
  const { data: before, error: readError } = await me.service.from("campaigns").select("id, cover").eq("id", id).eq("advertiser_id", me.user.id).maybeSingle();
  if (isSchemaOutdated(readError)) return { error: "The campaign picture needs the database update (migration 0044) first." };
  if (!before) {
    await drop();
    return { error: "That campaign no longer exists." };
  }
  const { error } = await me.service.from("campaigns").update({ cover: next }).eq("id", id).eq("advertiser_id", me.user.id);
  if (error) {
    await drop();
    return { error: "Could not save the picture. Try again." };
  }
  const old = parseCover(before.cover);
  if (old.kind === "image" && `image:${old.path}` !== next && old.path.startsWith(`${me.user.id}/`)) {
    const { error: removeError } = await me.service.storage.from("creatives").remove([old.path]);
    if (removeError) console.warn("[DeusADS] old campaign picture not removed:", old.path, removeError.message);
  }

  revalidatePath(`/dashboard/advertising/c/${id}`, "layout");
  revalidatePath("/dashboard/advertising");
  return { ok: true };
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
  if ((count ?? 0) > 0) return { error: "This campaign is still running. Stop it first, then delete it." };

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
  // A campaign started by audience books its creatives again by itself: take this one out of its plan first.
  const { data: current } = await me.service.from("campaigns").select("plan").eq("id", String(campaignId ?? "")).eq("advertiser_id", me.user.id).maybeSingle();
  if (current?.plan && planCreativeIds(current.plan).includes(String(creativeId ?? ""))) {
    await me.service.from("campaigns").update({ plan: removeFromPlan(current.plan, String(creativeId)) }).eq("id", String(campaignId));
  }
  for (const booking of open ?? []) {
    const { error: cancelError } = await me.service.rpc("cancel_booking", { p_booking: booking.id, p_advertiser: me.user.id });
    if (cancelError) return { error: bookingErrorMessage(cancelError) };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, count: (open ?? []).length };
}

/**
 * Add creatives from the library to a campaign that is already set up. A campaign started by audience books them
 * on every fitting placement (like its first creative); a campaign with placements of its own gets them on those
 * placements, with the same dates. A draft has no placements yet: it is finished in the wizard.
 */
export async function addCreativesToCampaign({ campaignId, creativeIds }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const { service, user } = me;

  const { data: campaign } = await service.from("campaigns").select("id, plan").eq("id", String(campaignId ?? "")).eq("advertiser_id", user.id).maybeSingle();
  if (!campaign) return { error: "Unknown campaign." };

  const wanted = [...new Set((Array.isArray(creativeIds) ? creativeIds : []).map(String))].slice(0, 20);
  if (wanted.length === 0) return { error: "Pick a creative." };
  const { data: mine } = await service.from("creatives").select("id, status").in("id", wanted).eq("owner_id", user.id).neq("kind", "own");
  if ((mine ?? []).length !== wanted.length) return { error: "Pick creatives from your library." };
  if ((mine ?? []).some((creative) => creative.status === "rejected")) return { error: "A rejected creative cannot be added. Upload another one." };

  const { data: open, error: openError } = await service
    .from("bookings")
    .select("creative_id, placement_id, starts_on, ends_on")
    .eq("campaign_id", campaign.id)
    .eq("advertiser_id", user.id)
    .in("status", ["pending", "approved"]);
  if (bookingsMissing(openError)) return { error: MISSING };
  if (openError) return { error: "Could not read the campaign. Try again." };

  const inside = new Set([...(open ?? []).map((row) => row.creative_id), ...planCreativeIds(campaign.plan)]);
  const fresh = wanted.filter((id) => !inside.has(id));
  if (fresh.length === 0) return { ok: true, added: 0 };

  if (campaign.plan?.launched && campaign.plan.mode === "audience") {
    const stored = await service.from("campaigns").update({ plan: addToPlan(campaign.plan, fresh) }).eq("id", campaign.id);
    if (isSchemaOutdated(stored.error)) return { error: RULES_MISSING };
    if (stored.error) return { error: "Could not add the creatives. Try again." };
    await syncCampaign(service, campaign.id).catch(() => null);
  } else if ((open ?? []).length > 0) {
    const placementIds = [...new Set(open.map((row) => row.placement_id))];
    const starts = open.map((row) => row.starts_on).filter(Boolean).sort()[0] ?? "";
    const ends = open.map((row) => row.ends_on).filter(Boolean).sort().at(-1) ?? "";
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const creativeId of fresh) {
      const result = await createBooking({ campaignId: campaign.id, creativeId, placementIds, startsOn: starts >= todayIso ? starts : "", endsOn: ends >= todayIso ? ends : "" });
      if (result?.error) return { error: result.error };
    }
  } else {
    return { error: "Finish setting up this campaign first: it has no placements yet." };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, added: fresh.length };
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

const PAUSE_UNTIL_MISSING = "Pausing until a date needs migration 0028 in the Supabase SQL editor first.";

/**
 * Pause a whole campaign (or let it run again): it stops being served everywhere, players see the change at their
 * next launch. `until` ("YYYY-MM-DD", a day after today) makes the pause end by itself on that day; without it the
 * campaign stays paused until it is resumed.
 */
export async function pauseCampaign({ campaignId, paused, until }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const campaign = await ownCampaign(me, campaignId);
  if (!campaign) return { error: "Unknown campaign." };

  let resumeOn = null;
  if (paused && until) {
    const day = String(until);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { error: "Pick a day to resume on." };
    if (day <= new Date().toISOString().slice(0, 10)) return { error: "Pick a day after today." };
    resumeOn = day;
  }

  const fields = { paused_at: paused ? new Date().toISOString() : null };
  let { error } = await me.service.from("campaigns").update({ ...fields, resume_on: paused ? resumeOn : null }).eq("id", campaign.id);
  // Before migration 0028 a pause has no end day: it still works, it just lasts until it is lifted.
  if (isSchemaOutdated(error)) {
    if (resumeOn) return { error: PAUSE_UNTIL_MISSING };
    ({ error } = await me.service.from("campaigns").update(fields).eq("id", campaign.id));
  }
  if (isSchemaOutdated(error)) return { error: RULES_MISSING };
  if (error) return { error: "Could not change the campaign. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, paused: Boolean(paused), resumeOn };
}

/**
 * Stop a campaign for good: every booking that is still open is withdrawn (live ones stop showing at once, the
 * developers hear about it) and a campaign started by audience is not booked again. It cannot be resumed; the
 * advertiser duplicates it to run again.
 */
export async function stopCampaign({ campaignId }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const { service, user } = me;
  const campaign = await ownCampaign(me, campaignId);
  if (!campaign) return { error: "Unknown campaign." };

  // First make sure nothing new is booked, then withdraw what is open.
  const { data: current } = await service.from("campaigns").select("plan").eq("id", campaign.id).maybeSingle();
  const plan = { ...(current?.plan ?? {}), launched: false, stoppedAt: new Date().toISOString() };
  const marked = await service.from("campaigns").update({ plan }).eq("id", campaign.id);
  if (marked.error && !isSchemaOutdated(marked.error)) return { error: "Could not stop the campaign. Try again." };

  const { data: open, error: openError } = await service
    .from("bookings")
    .select("id, developer_id, status")
    .eq("campaign_id", campaign.id)
    .eq("advertiser_id", user.id)
    .in("status", ["pending", "approved"]);
  if (bookingsMissing(openError)) return { error: MISSING };
  if (openError) return { error: "Could not stop the campaign. Try again." };

  let failed = 0;
  const wasLive = [];
  for (const booking of open ?? []) {
    const { error } = await service.rpc("cancel_booking", { p_booking: booking.id, p_advertiser: user.id });
    if (error) failed += 1;
    else if (booking.status === "approved") wasLive.push(booking.developer_id);
  }
  // A paused campaign that is stopped is no longer "paused": it is over.
  await service.from("campaigns").update({ paused_at: null }).eq("id", campaign.id);
  if (failed > 0) return { error: `${failed} of ${(open ?? []).length} placements could not be stopped. Try again.` };

  await notifyMany(service, wasLive, "An advertiser stopped a campaign that was showing in your game.", "/dashboard/games", "dev_withdrew");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/admin/bookings");
  return { ok: true, stopped: (open ?? []).length };
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
  const own = planCreativeIds(plan).filter((id) => ownCreativeIds.has(id)).slice(0, 20);
  const [creativeId = null, ...moreCreativeIds] = own;
  const mode = plan?.mode === "manual" ? "manual" : "audience";
  return { creativeId, ...(moreCreativeIds.length ? { moreCreativeIds } : {}), mode, placementIds: cleanPlacementIds(plan?.placementIds ?? []), startsOn: "", endsOn: "" };
}

/**
 * Save a campaign before it is started: its name, audience and the choices made so far. It shows in the list as a Draft
 * and opens in the wizard where it was left. Creates the campaign, or updates the draft when `campaignId` is given.
 */
export async function saveDraft({ campaignId, campaignName, targeting, plan, category }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };

  const name = cleanCampaignName(campaignName);
  if (!name) return { error: "Name the campaign." };
  const audience = parseTargeting(targeting ?? null);
  if (audience.error) return { error: audience.error };

  const { data: mine } = await me.service.from("creatives").select("id").eq("owner_id", me.user.id);
  if (category && !isCategory(category)) return { error: "Choose one of the categories." };
  const fields = { name, targeting: audience.value, plan: cleanPlan(plan, new Set((mine ?? []).map((row) => row.id))) };
  const withCategory = category ? { ...fields, category } : fields;

  if (campaignId) {
    const campaign = await ownCampaign(me, campaignId);
    if (!campaign) return { error: "Unknown campaign." };
    let { error } = await me.service.from("campaigns").update(withCategory).eq("id", campaign.id);
    if (category && isSchemaOutdated(error)) ({ error } = await me.service.from("campaigns").update(fields).eq("id", campaign.id));
    if (isSchemaOutdated(error)) return { error: RULES_MISSING };
    if (error) return { error: "Could not save the draft. Try again." };
    revalidatePath("/dashboard/advertising");
    return { ok: true, campaignId: campaign.id };
  }

  let { data, error } = await me.service.from("campaigns").insert({ advertiser_id: me.user.id, ...withCategory }).select("id").single();
  if (category && isSchemaOutdated(error)) ({ data, error } = await me.service.from("campaigns").insert({ advertiser_id: me.user.id, ...fields }).select("id").single());
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
