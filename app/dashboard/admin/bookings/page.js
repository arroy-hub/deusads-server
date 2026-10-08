import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import { loadBookings } from "../../../../lib/bookings-data";
import BookingRow from "../../booking-row";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const { bookings, error } = await loadBookings(admin.service, (query) => query, { limit: 200 });
  const waiting = bookings.filter((booking) => booking.status === "pending" && booking.admin === "pending");
  const rest = bookings.filter((booking) => !waiting.includes(booking));

  return (
    <>
      <div className="main-head">
        <h1>Bookings</h1>
      </div>
      <p className="lede">
        A booking goes live when you and the developer of the game both approve it. Approving here does not
        override the developer.
      </p>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}

      <h2 style={{ marginBottom: "0.75rem" }}>Waiting for review ({waiting.length})</h2>
      {waiting.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {waiting.map((booking) => (
                <BookingRow key={booking.id} booking={booking} view="admin" />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>No bookings are waiting for review.</p>
        </div>
      )}

      {rest.length > 0 && (
        <>
          <h2 style={{ margin: "2.5rem 0 0.75rem" }}>All other bookings</h2>
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <tbody>
                {rest.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} view="admin" />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
