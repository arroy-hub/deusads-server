import { evaluate } from "./targeting.js";
import { notifyMany } from "./notify.js";
import { planCreativeIds } from "./campaign-plan.js";

// A campaign started "by audience" stores who it is for (its audience), the creative and the dates, and then keeps
// itself booked: every open placement in a game that fits gets a booking, now and whenever a developer opens a
// placement or changes what their game is. A campaign with no matching game yet simply waits.
// The audience is also checked again each time a game asks for its ads (lib/campaign-rules.js), so this only decides
// where the campaign has a booking; it never shows an ad where the audience does not fit.

const today = () => new Date().toISOString().slice(0, 10);

/** Which placements of `open` ([{ id, owner_id, game_id, games }]) this campaign should still be booked on. Pure. */
export function placementsToBook({ open, targeting, creativeTargeting = null, excludedGames = new Set(), alreadyBooked = new Set(), advertiserId }) {
  return open.filter((placement) => {
    if (placement.owner_id === advertiserId) return false;
    if (excludedGames.has(placement.game_id)) return false;
    if (alreadyBooked.has(placement.id)) return false;
    const profile = placement.games ?? null;
    if (!profile) return targeting == null && creativeTargeting == null;
    return evaluate(profile, targeting).fits && evaluate(profile, creativeTargeting).fits;
  });
}

/**
 * Books what is missing for one campaign started by audience, for each of its creatives (the main one and the ones
 * added later). Returns { booked, waiting } or { skipped: reason }.
 * Safe to call at any time and as often as wanted: it only adds bookings that do not exist yet.
 */
export async function syncCampaign(service, campaignId) {
  const { data: campaign, error } = await service.from("campaigns").select("id, advertiser_id, targeting, plan, paused_at").eq("id", campaignId).maybeSingle();
  if (error || !campaign) return { skipped: "unknown" };
  const plan = campaign.plan;
  const creativeIds = planCreativeIds(plan);
  if (!plan?.launched || plan.mode !== "audience" || creativeIds.length === 0) return { skipped: "not by audience" };
  if (plan.endsOn && plan.endsOn < today()) return { skipped: "ended" };

  const { data: creatives } = await service.from("creatives").select("id, status, targeting").in("id", creativeIds).eq("owner_id", campaign.advertiser_id);
  const usable = (creatives ?? []).filter((creative) => creative.status !== "rejected");
  if (usable.length === 0) return { skipped: "creative" };

  const catalog = await service
    .from("placements")
    .select("id, owner_id, game_id, games(genres, platforms, languages, countries)")
    .eq("open_to_advertisers", true)
    .is("removed_at", null);
  if (catalog.error) return { skipped: "catalog" };

  const [excluded, existing] = await Promise.all([
    service.from("campaign_excluded_games").select("game_id").eq("campaign_id", campaign.id),
    service.from("bookings").select("placement_id, creative_id").eq("campaign_id", campaign.id),
  ]);
  const excludedGames = new Set((excluded.data ?? []).map((row) => row.game_id));

  // A start day in the past means "now"; the end day stays.
  const startsOn = plan.startsOn && plan.startsOn >= today() ? plan.startsOn : null;
  const dated = Boolean(startsOn || plan.endsOn);

  let booked = 0;
  let waiting = 0;
  const goingLive = [];
  for (const creative of usable) {
    const fresh = placementsToBook({
      open: catalog.data ?? [],
      targeting: campaign.targeting ?? null,
      creativeTargeting: creative.targeting ?? null,
      excludedGames,
      alreadyBooked: new Set((existing.data ?? []).filter((row) => row.creative_id === creative.id).map((row) => row.placement_id)),
      advertiserId: campaign.advertiser_id,
    });
    if (fresh.length === 0) continue;

    const { data: created, error: insertError } = await service
      .from("bookings")
      .insert(
        fresh.map((placement) => ({
          campaign_id: campaign.id,
          advertiser_id: campaign.advertiser_id,
          developer_id: placement.owner_id,
          creative_id: creative.id,
          placement_id: placement.id,
          ...(dated ? { starts_on: startsOn, ends_on: plan.endsOn || null } : {}),
        }))
      )
      .select("id, developer_id");
    if (insertError) continue;

    for (const booking of created ?? []) {
      const { data: status, error: activateError } = await service.rpc("activate_booking", { p_booking: booking.id });
      if (!activateError && status === "approved") {
        booked += 1;
        goingLive.push(booking.developer_id);
      } else waiting += 1;
    }
  }
  await notifyMany(service, goingLive, "A new ad is showing in your game. You can pause or block it in the game's Campaigns tab.", "/dashboard/games", "dev_campaign");
  return { booked, waiting };
}

/** Syncs every campaign started by audience (or one advertiser's). Never throws: a failing campaign does not stop the rest. */
export async function syncAllCampaigns(service, { advertiserId } = {}) {
  let query = service.from("campaigns").select("id").not("plan", "is", null);
  if (advertiserId) query = query.eq("advertiser_id", advertiserId);
  const { data, error } = await query;
  if (error) return { campaigns: 0 };
  let count = 0;
  for (const row of data ?? []) {
    try {
      const result = await syncCampaign(service, row.id);
      if (!result.skipped) count += 1;
    } catch {
      // keep going
    }
  }
  return { campaigns: count };
}
