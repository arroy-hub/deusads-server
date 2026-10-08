import { bookingLabel } from "./booking-rules";

const COLUMNS =
  "id, campaign_id, advertiser_id, developer_id, creative_id, placement_id, status, admin_decision, developer_decision, decision_note, created_at";

const who = (account) => account?.company || account?.email || "Unknown";

/**
 * Bookings with everything the screens show, read with the service client.
 * `scope` narrows the query (always by the caller's own id or role: the service
 * client ignores row-level security). Related rows are fetched in a few batched
 * queries rather than embedded, so the result does not depend on how PostgREST
 * names the relationships.
 */
export async function loadBookings(service, scope, { limit = 100 } = {}) {
  const { data: rows, error } = await scope(
    service.from("bookings").select(COLUMNS).order("created_at", { ascending: false }).limit(limit)
  );
  if (error) return { error, bookings: [] };
  if (!rows?.length) return { bookings: [] };

  const ids = (key) => [...new Set(rows.map((row) => row[key]))];
  const [campaigns, creatives, placements, accounts] = await Promise.all([
    service.from("campaigns").select("id, name").in("id", ids("campaign_id")),
    service.from("creatives").select("id, name, storage_path, width_px, height_px").in("id", ids("creative_id")),
    service.from("placements").select("id, label, external_id, scene, game_id").in("id", ids("placement_id")),
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
      note: row.decision_note ?? "",
      created: String(row.created_at).slice(0, 10),
      campaign: campaignOf.get(row.campaign_id)?.name ?? "Campaign",
      creativeName: creative?.name ?? "Creative",
      creativeUrl: creative ? service.storage.from("creatives").getPublicUrl(creative.storage_path).data.publicUrl : "",
      creativeSize: creative?.width_px && creative?.height_px ? `${creative.width_px} × ${creative.height_px}` : "",
      game: gameOf.get(placement?.game_id)?.name ?? "Game",
      placement: placement?.label || placement?.external_id || "Placement",
      scene: placement?.scene ?? "",
      advertiserId: row.advertiser_id,
      developerId: row.developer_id,
      advertiser: who(accountOf.get(row.advertiser_id)),
      developerName: who(accountOf.get(row.developer_id)),
    };
  });
  return { bookings };
}
