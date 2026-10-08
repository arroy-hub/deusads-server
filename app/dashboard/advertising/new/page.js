import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import BookingForm from "./booking-form";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const me = await getMember();
  if (!me || (me.role !== "advertiser" && me.role !== "admin")) notFound();
  const { service, user } = me;

  const [{ data: creatives }, campaignResult, { data: placements }, { data: held }] = await Promise.all([
    service
      .from("creatives")
      .select("id, name, status, width_px, height_px")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    service.from("campaigns").select("id, name").eq("advertiser_id", user.id).order("created_at", { ascending: false }),
    // The catalog: live placements in other people's games. Advertisers see the
    // game and placement names and the shape of the slot, nothing about its owner.
    service
      .from("placements")
      .select("id, label, external_id, scene, aspect_ratio, game_id, games(name)")
      .neq("owner_id", user.id)
      .is("removed_at", null)
      .order("first_seen_at", { ascending: true }),
    service.from("bookings").select("placement_id, creative_id, status").eq("status", "approved"),
  ]);

  const bookedIds = new Set((held ?? []).map((row) => row.placement_id));
  const games = new Map();
  for (const placement of placements ?? []) {
    const name = placement.games?.name ?? "Game";
    if (!games.has(placement.game_id)) games.set(placement.game_id, { name, placements: [] });
    games.get(placement.game_id).placements.push({
      id: placement.id,
      label: placement.label || placement.external_id,
      scene: placement.scene || "",
      aspect: placement.aspect_ratio ? Number(placement.aspect_ratio) : null,
      booked: bookedIds.has(placement.id),
    });
  }

  return (
    <>
      <div className="main-head">
        <h1>New booking</h1>
        <Link href="/dashboard/advertising" className="button button-quiet">
          Back
        </Link>
      </div>
      <p className="lede">
        Pick an approved creative and the placements you want. Each one is sent to its developer and to
        DeusADS for approval.
      </p>
      {bookingsMissing(campaignResult.error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}
      <BookingForm
        creatives={(creatives ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          approved: item.status === "approved",
          status: item.status,
          size: item.width_px && item.height_px ? `${item.width_px} × ${item.height_px}` : "",
        }))}
        campaigns={campaignResult.data ?? []}
        games={[...games.values()]}
      />
    </>
  );
}
