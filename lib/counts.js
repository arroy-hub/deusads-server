// Small counts for the menu badges. Every one answers 0 when its table is missing
// (migration not applied yet) or the query fails, so a badge can never break a page.

const count = async (query) => {
  const { count: total, error } = await query;
  return error ? 0 : (total ?? 0);
};

/** What is waiting for an admin: creatives, bookings and advertiser applications. */
export async function adminCounts(service) {
  const [creatives, bookings, applications] = await Promise.all([
    count(service.from("creatives").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(
      service
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("admin_decision", "pending")
    ),
    count(service.from("role_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  return { creatives, bookings, applications, total: creatives + bookings + applications };
}

/** Unread notifications of the signed-in user (row-level security limits it to theirs). */
export function unreadCount(db, userId) {
  if (!userId) return 0;
  return count(db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null));
}
