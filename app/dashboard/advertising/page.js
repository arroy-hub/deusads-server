import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadBookings } from "../../../lib/bookings-data";
import { blockedCategories, controlMap, controlNote } from "../../../lib/game-controls";
import BookingRow from "../booking-row";
import CampaignHead from "./campaign-head";
import { canAdvertise } from "../../../lib/admin-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function AdvertisingPage() {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();

  const { bookings, error } = await loadBookings(me.service, (query) => query.eq("advertiser_id", me.user.id));

  // What each developer paused or blocked in the games these bookings are in (migration 0023). Without it nothing is added.
  const gameIds = [...new Set(bookings.map((booking) => booking.gameId).filter(Boolean))];
  if (gameIds.length) {
    const [controlRows, categoryRows] = await Promise.all([
      me.service.from("game_ad_controls").select("game_id, scope, target_id, state, reason, comment").in("game_id", gameIds),
      me.service.from("game_category_blocks").select("game_id, category, blocked").in("game_id", gameIds),
    ]);
    if (!controlRows.error && !categoryRows.error) {
      const perGame = new Map(
        gameIds.map((id) => [
          id,
          {
            controls: controlMap((controlRows.data ?? []).filter((row) => row.game_id === id)),
            blocked: blockedCategories((categoryRows.data ?? []).filter((row) => row.game_id === id)),
          },
        ])
      );
      for (const booking of bookings) {
        if (booking.status !== "approved" && booking.status !== "pending") continue;
        booking.controlNote = controlNote(
          { campaignId: booking.campaignId, advertiserId: booking.advertiserId, creativeId: booking.creativeId, category: booking.category },
          perGame.get(booking.gameId)
        );
      }
    }
  }

  // Campaigns come from their own table so an empty one still shows (and can be deleted).
  const { data: campaignRows } = await me.service
    .from("campaigns")
    .select("id, name")
    .eq("advertiser_id", me.user.id)
    .order("created_at", { ascending: false });
  const campaigns = (campaignRows ?? []).map((campaign) => ({
    ...campaign,
    bookings: bookings.filter((booking) => booking.campaignId === campaign.id),
  }));

  return (
    <>
      <div className="main-head">
        <h1>Campaigns</h1>
        <div className="row">
          <Link href="/dashboard/advertising/reports" className="button button-quiet">
            Reports
          </Link>
          <Link href="/dashboard/advertising/new" className="button">
            Find placements
          </Link>
        </div>
      </div>
      <p className="lede">
        Your campaigns and the placements each one is booked on, with their status. Bookings go live by themselves
        (from the start date, once the creative is approved); a developer can pause or block an ad in their game, and you see it here. Add more
        placements under Find placements.
      </p>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}

      {campaigns.length === 0 && !error ? (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>
            No bookings yet. Upload a creative under Creatives, wait for it to be approved, then
            book placements.
          </p>
        </div>
      ) : (
        campaigns.map((campaign) => (
          <section key={campaign.id} style={{ marginBottom: "2rem" }}>
            <CampaignHead
              id={campaign.id}
              name={campaign.name}
              bookings={campaign.bookings.filter((b) => b.status !== "pending" && b.status !== "approved").length}
            />
            {campaign.bookings.length > 0 ? (
              <div className="panel" style={{ padding: 0 }}>
                <table>
                  <tbody>
                    {campaign.bookings.map((booking) => (
                      <BookingRow key={booking.id} booking={booking} view="advertiser" />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="settings-help">No bookings in this campaign.</p>
            )}
          </section>
        ))
      )}
    </>
  );
}
