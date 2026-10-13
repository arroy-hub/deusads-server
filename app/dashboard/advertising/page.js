import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadBookings } from "../../../lib/bookings-data";
import { attachControls } from "../../../lib/advertiser-data";
import { campaignStatus } from "../../../lib/advertiser-overview";
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
  await attachControls(me.service, bookings);

  // Campaigns come from their own table so an empty one still shows (and can be deleted).
  const { data: campaignRows } = await me.service
    .from("campaigns")
    .select("id, name")
    .eq("advertiser_id", me.user.id)
    .order("created_at", { ascending: false });
  // The advertiser's creatives, used by any campaign (a developer's own pictures, kind 'own', are not these).
  let { data: creativeRows, error: creativeError } = await me.service
    .from("creatives")
    .select("id, name, status, width_px, height_px, review_note")
    .eq("owner_id", me.user.id)
    .neq("kind", "own")
    .order("created_at", { ascending: false });
  if (creativeError) {
    ({ data: creativeRows } = await me.service
      .from("creatives")
      .select("id, name, status, width_px, height_px")
      .eq("owner_id", me.user.id)
      .order("created_at", { ascending: false }));
  }
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
            New campaign
          </Link>
        </div>
      </div>
      <p className="lede">
        Your campaigns and the placements each one is booked on, with their status. Bookings go live by themselves
        (from the start date, once the creative is approved); a developer can pause or block an ad in their game, and you see it here. Open a
        campaign to add placements or see its report.
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
            No campaigns yet. Start one: add a creative, choose where it runs, set the dates.
          </p>
        </div>
      ) : (
        campaigns.map((campaign) => (
          <section key={campaign.id} style={{ marginBottom: "2rem" }}>
            <CampaignHead
              id={campaign.id}
              name={campaign.name}
              status={campaignStatus(campaign.bookings)}
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

      {creativeRows?.length > 0 && (
        <section className="panel" aria-labelledby="creatives-title" style={{ padding: 0 }}>
          <h2 id="creatives-title" style={{ padding: "1.25rem 1.25rem 0.5rem" }}>
            Your creatives
          </h2>
          <p className="ov-note" style={{ padding: "0 1.25rem" }}>
            Any creative can be used in any campaign. Open one to set its crop, add pictures for other formats and choose its audience.
          </p>
          <div className="ov-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {creativeRows.map((creative) => (
                  <tr key={creative.id}>
                    <td className="ov-name">
                      <Link href={`/dashboard/creatives/${creative.id}`}>{creative.name}</Link>
                    </td>
                    <td>{creative.width_px && creative.height_px ? `${creative.width_px} × ${creative.height_px}` : "—"}</td>
                    <td>
                      {creative.status === "approved" ? "Approved" : creative.status === "rejected" ? `Rejected${creative.review_note ? `: ${creative.review_note}` : ""}` : "In review"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
