import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadBookings } from "../../../lib/bookings-data";
import BookingRow from "../booking-row";

export const dynamic = "force-dynamic";

export default async function AdvertisingPage() {
  const me = await getMember();
  if (!me || (me.role !== "advertiser" && me.role !== "admin")) notFound();

  const { bookings, error } = await loadBookings(me.service, (query) => query.eq("advertiser_id", me.user.id));

  const campaigns = new Map();
  for (const booking of bookings) {
    if (!campaigns.has(booking.campaign)) campaigns.set(booking.campaign, []);
    campaigns.get(booking.campaign).push(booking);
  }

  return (
    <>
      <div className="main-head">
        <h1>Advertising</h1>
        <Link href="/dashboard/advertising/new" className="button">
          New booking
        </Link>
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

      {campaigns.size === 0 && !error ? (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>
            No bookings yet. Upload a creative under Library → Creatives, wait for it to be approved, then
            book placements.
          </p>
        </div>
      ) : (
        [...campaigns.entries()].map(([name, rows]) => (
          <section key={name} style={{ marginBottom: "2rem" }}>
            <h2 style={{ marginBottom: "0.75rem" }}>{name}</h2>
            <div className="panel" style={{ padding: 0 }}>
              <table>
                <tbody>
                  {rows.map((booking) => (
                    <BookingRow key={booking.id} booking={booking} view="advertiser" />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  );
}
