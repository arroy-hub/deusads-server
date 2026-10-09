import { bookingLabel, dateRangeText, fitNote } from "./booking-rules";
import { isSchemaOutdated } from "./api";

const COLUMNS =
  "id, campaign_id, advertiser_id, developer_id, creative_id, placement_id, status, admin_decision, developer_decision, decision_note, created_at";

// starts_on / ends_on come with migration 0013; without it the list still loads.
const COLUMNS_WITH_DATES = `${COLUMNS}, starts_on, ends_on`;

const who = (account) => account?.company || account?.email || "Unknown";

/**
 * Bookings with everything the screens show, read with the service client.
 * `scope` narrows the query (always by the caller's own id or role: the service
 * client ignores row-level security). Related rows are fetched in a few batched
 * queries rather than embedded, so the result does not depend on how PostgREST
 * names the relationships.
 */
export async function loadBookings(service, scope, { limit = 100 } = {}) {
  const read = (columns) =>
    scope(service.from("bookings").select(columns).order("created_at", { ascending: false }).limit(limit));
  let { data: rows, error } = await read(COLUMNS_WITH_DATES);
  if (isSchemaOutdated(error)) ({ data: rows, error } = await read(COLUMNS));
  if (error) return { error, bookings: [] };
  if (!rows?.length) return { bookings: [] };

  const ids = (key) => [...new Set(rows.map((row) => row[key]))];
  const [campaigns, creatives, placements, accounts] = await Promise.all([
    service.from("campaigns").select("id, name").in("id", ids("campaign_id")),
    // ad_category comes with migration 0015; without it the list still loads.
    service
      .from("creatives")
      .select("id, name, storage_path, width_px, height_px, ad_category")
      .in("id", ids("creative_id"))
      .then(async (result) =>
        isSchemaOutdated(result.error)
          ? service
              .from("creatives")
              .select("id, name, storage_path, width_px, height_px")
              .in("id", ids("creative_id"))
          : result
      ),
    service.from("placements").select("id, label, external_id, scene, game_id, aspect_ratio").in("id", ids("placement_id")),
    service
      .from("accounts")
      .select("id, email, company")
      .in("id", [...new Set([...ids("advertiser_id"), ...ids("developer_id")])]),
  ]);
  const games = await service
    .from("games")
    .select("id, name")
    .in("id", [...new Set((placements.data ?? []).map((placement) => placement.game_id))]);

  const byId = (result) => new Map((result.data ?? []).map((item) => [item.id, item]));
  const campaignOf = byId(campaigns);
  const creativeOf = byId(creatives);
  const placementOf = byId(placements);
  const accountOf = byId(accounts);
  const gameOf = byId(games);

  const bookings = rows.map((row) => {
    const creative = creativeOf.get(row.creative_id);
    const placement = placementOf.get(row.placement_id);
    return {
      id: row.id,
      status: row.status,
      admin: row.admin_decision,
      developer: row.developer_decision,
      label: bookingLabel(row),
      startsOn: row.starts_on ?? null,
      endsOn: row.ends_on ?? null,
      dates: dateRangeText(row.starts_on, row.ends_on),
      fit: fitNote({ width: creative?.width_px, height: creative?.height_px, aspect: placement?.aspect_ratio }),
      note: row.decision_note ?? "",
      created: String(row.created_at).slice(0, 10),
      campaign: campaignOf.get(row.campaign_id)?.name ?? "Campaign",
      creativeName: creative?.name ?? "Creative",
      category: creative?.ad_category ?? "other",
      creativeUrl: creative ? service.storage.from("creatives").getPublicUrl(creative.storage_path).data.publicUrl : "",
      creativeSize: creative?.width_px && creative?.height_px ? `${creative.width_px} × ${creative.height_px}` : "",
      game: gameOf.get(placement?.game_id)?.name ?? "Game",
      placement: placement?.label || placement?.external_id || "Placement",
      scene: placement?.scene ?? "",
      campaignId: row.campaign_id,
      placementId: row.placement_id,
      creativeId: row.creative_id,
      advertiserId: row.advertiser_id,
      developerId: row.developer_id,
      advertiser: who(accountOf.get(row.advertiser_id)),
      developerName: who(accountOf.get(row.developer_id)),
    };
  });
  return { bookings };
}

/** Who and what a booking is about, for notifications: ids plus "Game · Placement". */
export async function describeBooking(service, bookingId) {
  const { data: booking } = await service
    .from("bookings")
    .select("advertiser_id, developer_id, placement_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const { data: placement } = await service
    .from("placements")
    .select("label, external_id, games(name)")
    .eq("id", booking.placement_id)
    .maybeSingle();
  const game = placement?.games?.name ?? "a game";
  return {
    advertiserId: booking.advertiser_id,
    developerId: booking.developer_id,
    where: `${game} · ${placement?.label || placement?.external_id || "placement"}`,
  };
}
