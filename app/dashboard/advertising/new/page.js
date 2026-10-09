import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import { isSchemaOutdated } from "../../../../lib/api";
import BookingForm from "./booking-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find placements" };

export default async function NewBookingPage() {
  const me = await getMember();
  if (!me || me.role !== "advertiser") notFound();
  const { service, user } = me;

  let catalog = null;
  const [{ data: creatives }, campaignResult, firstCatalog] = await Promise.all([
    service
      .from("creatives")
      .select("id, name, status, width_px, height_px, safe_x, safe_y, safe_w, safe_h")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    service.from("campaigns").select("id, name").eq("advertiser_id", user.id).order("created_at", { ascending: false }),
    // The catalog: live placements in other people's games. Advertisers see the
    // game and placement names and the shape of the slot, nothing about its owner.
    catalogQuery(service, user.id, { onlyOpen: true, withProfile: true }),
  ]);

  // Migration 0017 adds the safe zone and per-format images; without it the plain columns still load.
  let creativeRows = creatives;
  if (!creativeRows) {
    ({ data: creativeRows } = await service
      .from("creatives")
      .select("id, name, status, width_px, height_px")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }));
  }
  const assetsOf = new Map();
  if (creativeRows?.length) {
    const { data: assetRows } = await service
      .from("creative_assets")
      .select("creative_id, format_id, aspect, status")
      .in("creative_id", creativeRows.map((item) => item.id));
    for (const row of assetRows ?? []) {
      if (!assetsOf.has(row.creative_id)) assetsOf.set(row.creative_id, []);
      assetsOf.get(row.creative_id).push({ formatId: row.format_id, aspect: Number(row.aspect), status: row.status });
    }
  }

  // Without migration 0018 the games carry no description (and nothing can be aimed); without
  // migration 0014 there is no switch yet: every live placement is listed, as before.
  catalog = firstCatalog;
  let profiled = true;
  if (isSchemaOutdated(catalog.error)) {
    profiled = false;
    catalog = await catalogQuery(service, user.id, { onlyOpen: true, withProfile: false });
  }
  if (isSchemaOutdated(catalog.error)) catalog = await catalogQuery(service, user.id, { onlyOpen: false, withProfile: false });
  const placements = catalog.data;

  // The audience of each creative (migration 0018); without it nothing is aimed.
  const audienceOf = new Map();
  if (profiled && creativeRows?.length) {
    const { data: aimed, error: aimedError } = await service
      .from("creatives")
      .select("id, targeting")
      .eq("owner_id", user.id);
    if (aimedError) profiled = false;
    else for (const row of aimed ?? []) audienceOf.set(row.id, row.targeting ?? null);
  }

  const games = new Map();
  for (const placement of placements ?? []) {
    const name = placement.games?.name ?? "Game";
    if (!games.has(placement.game_id)) {
      games.set(placement.game_id, {
        id: placement.game_id,
        name,
        profile: profiled
          ? {
              genres: placement.games?.genres ?? [],
              platforms: placement.games?.platforms ?? [],
              languages: placement.games?.languages ?? [],
            }
          : null,
        placements: [],
      });
    }
    games.get(placement.game_id).placements.push({
      id: placement.id,
      label: placement.label || placement.external_id,
      scene: placement.scene || "",
      aspect: placement.aspect_ratio ? Number(placement.aspect_ratio) : null,
    });
  }

  return (
    <>
      <div className="main-head">
        <h1>Find placements</h1>
        <Link href="/dashboard/advertising" className="button button-quiet">
          Back
        </Link>
      </div>
      <p className="lede">
        Pick a creative and the placements you want. Only placements their developers have opened to
        advertisers are listed. Bookings start automatically; several advertisers can share a placement and
        take turns, and a developer can switch an ad off.
      </p>
      {bookingsMissing(campaignResult.error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}
      <BookingForm
        creatives={(creativeRows ?? []).map((item) => ({
          safe: item.safe_x == null ? null : { x: item.safe_x, y: item.safe_y, w: item.safe_w, h: item.safe_h },
          assets: assetsOf.get(item.id) ?? [],
          targeting: audienceOf.get(item.id) ?? null,
          id: item.id,
          name: item.name,
          approved: item.status === "approved",
          status: item.status,
          size: item.width_px && item.height_px ? `${item.width_px} × ${item.height_px}` : "",
          width: item.width_px ?? null,
          height: item.height_px ?? null,
        }))}
        campaigns={campaignResult.data ?? []}
        games={[...games.values()]}
        aimable={profiled}
      />
    </>
  );
}

/** Live placements in other people's games. Advertisers see game and placement names and the slot's shape, nothing about the owner. */
function catalogQuery(service, userId, { onlyOpen, withProfile }) {
  let query = service
    .from("placements")
    .select(`id, label, external_id, scene, aspect_ratio, game_id, games(name${withProfile ? ", genres, platforms, languages" : ""})`)
    .neq("owner_id", userId)
    .is("removed_at", null);
  if (onlyOpen) query = query.eq("open_to_advertisers", true);
  return query.order("first_seen_at", { ascending: true });
}
