// Small counts for the menu badges. Every one answers 0 when its table is missing
// (migration not applied yet) or the query fails, so a badge can never break a page.

const count = async (query) => {
  const { count: total, error } = await query;
  return error ? 0 : (total ?? 0);
};

/** What is waiting for an admin: creatives to review (bookings approve themselves). */
export async function adminCounts(service) {
  const [pendingCreatives, pendingAssets] = await Promise.all([
    count(service.from("creatives").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(service.from("creative_assets").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  const creatives = pendingCreatives + pendingAssets;
  return { creatives, bookings: 0, applications: 0, total: creatives };
}

/** Open reports about creatives (migration 0024); 0 until it is applied. */
export function openDisputes(service) {
  return count(service.from("creative_disputes").select("id", { count: "exact", head: true }).eq("status", "open"));
}

/** Unread notifications of the signed-in user (row-level security limits it to theirs). */
export function unreadCount(db, userId) {
  if (!userId) return 0;
  return count(db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null));
}
