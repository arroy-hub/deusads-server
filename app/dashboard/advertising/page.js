import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadBookings } from "../../../lib/bookings-data";
import BookingRow from "../booking-row";
import CampaignHead from "./campaign-head";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function AdvertisingPage() {
  const me = await getMember();
  if (!me || (me.role !== "advertiser" && me.role !== "admin")) notFound();

  const { bookings, error } = await loadBookings(me.service, (query) => query.eq("advertiser_id", me.user.id));

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
        Choose where your creative should appear. Each placement is approved by DeusADS and by the
        developer of the game; once both agree, the creative goes live without a new build of the game.
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
