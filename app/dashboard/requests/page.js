import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadBookings } from "../../../lib/bookings-data";
import BookingRow from "../booking-row";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const me = await getMember();
  if (!me) redirect("/login");

  const { bookings, error } = await loadBookings(me.service, (query) => query.eq("developer_id", me.user.id));
  const waiting = bookings.filter((booking) => booking.status === "pending" && booking.developer === "pending");
  const rest = bookings.filter((booking) => !waiting.includes(booking));

  return (
    <>
      <div className="main-head">
        <h1>Ad requests</h1>
      </div>
      <p className="lede">
        Advertisers ask to show their creative on your placements. Nothing goes live until you and DeusADS
        both approve. Your own creative on a placement is replaced only when you approve a request for it, and you can stop a live campaign at any time.
      </p>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}

      <h2 style={{ marginBottom: "0.75rem" }}>Waiting for you ({waiting.length})</h2>
      {waiting.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {waiting.map((booking) => (
                <BookingRow key={booking.id} booking={booking} view="developer" />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>No requests are waiting for you.</p>
        </div>
      )}

      {rest.length > 0 && (
        <>
          <h2 style={{ margin: "2.5rem 0 0.75rem" }}>Earlier</h2>
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <tbody>
                {rest.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} view="developer" />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
