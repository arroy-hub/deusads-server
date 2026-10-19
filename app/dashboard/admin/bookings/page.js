import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import { loadBookings } from "../../../../lib/bookings-data";
import { attachControls } from "../../../../lib/advertiser-data";
import { adminPausedIds } from "../../../../lib/admin-cards-data";
import { bookingRows, bookingWidgets, impKey, BOOKING_GROUPS, BOOKING_DEFAULTS } from "../../../../lib/admin-bookings";
import { userClient } from "../../../../lib/supabase-server";
import { loadDeckLayout } from "../../../../lib/deck-layout-data";
import BookingsView from "./bookings-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "All bookings" };

export default async function AdminBookingsPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const { bookings, error } = await loadBookings(admin.service, (query) => query, { limit: 1000 });
  await attachControls(admin.service, bookings);
  const [paused, layout, counts] = await Promise.all([
    adminPausedIds(admin.service, bookings.map((b) => b.id)),
    userClient().then((db) => loadDeckLayout(db, "admin_bookings")),
    // impressions per placement and creative (migration 0045); without it the column shows a dash
    admin.service.rpc("admin_booking_impressions"),
  ]);
  const impressions = counts.error ? null : new Map((counts.data ?? []).map((r) => [impKey(r.placement_id, r.creative_id), Number(r.n)]));
  const rows = bookingRows({ bookings, impressions, adminPaused: paused });

  if (bookingsMissing(error)) {
    return <p className="notice">Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to turn bookings on.</p>;
  }
  return <BookingsView rows={rows} widgets={bookingWidgets(rows)} groups={BOOKING_GROUPS} defaults={BOOKING_DEFAULTS} layout={layout} />;
}
