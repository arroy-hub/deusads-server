import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import { loadBookings } from "../../../../lib/bookings-data";
import BookingRow from "../../booking-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "All bookings" };

export default async function AdminBookingsPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const { bookings, error } = await loadBookings(admin.service, (query) => query, { limit: 200 });
  return (
    <>
      <div className="main-head">
        <h1>All bookings</h1>
      </div>
      <p className="lede">
        Read-only. Bookings approve themselves and developers decide what shows in their games, so there is
        nothing to approve here. To switch an account off, use People.
      </p>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}

      {bookings.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {bookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} view="admin" />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>No bookings yet.</p>
        </div>
      )}
    </>
  );
}
