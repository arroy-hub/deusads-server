// Small counts for the menu badges. Every one answers 0 when its table is missing
// (migration not applied yet) or the query fails, so a badge can never break a page.

const count = async (query) => {
  const { count: total, error } = await query;
  return error ? 0 : (total ?? 0);
};

/** What is waiting for an admin: creatives to review (bookings approve themselves). */
export async function adminCounts(service) {
  const creatives = await count(service.from("creatives").select("id", { count: "exact", head: true }).eq("status", "pending"));
  return { creatives, bookings: 0, applications: 0, total: creatives };
}

/** Open reports about creatives (migration 0024); 0 until it is applied. */
export async function openDisputes(service) {
  const open = await count(service.from("creative_disputes").select("id", { count: "exact", head: true }).eq("status", "open"));
  return open + (await disputesToAnswer(service).catch(() => 0));
}

/**
 * Decided reports that need the admin again (migration 0065): the advertiser sent a new picture for review, or wrote
 * last in the conversation about what DeusADS holds.
 */
async function disputesToAnswer(service) {
  const [pictures, whole] = await Promise.all([
    service.from("creative_picture_holds").select("dispute_id, sent_at"),
    service.from("creatives").select("hold_dispute").not("hold_dispute", "is", null),
  ]);
  const need = new Set((pictures.data ?? []).filter((row) => row.sent_at && row.dispute_id).map((row) => row.dispute_id));
  const held = [...new Set([...(pictures.data ?? []).map((row) => row.dispute_id), ...(whole.data ?? []).map((row) => row.hold_dispute)].filter(Boolean))];
  if (held.length) {
    const { data: talk } = await service.from("dispute_events").select("dispute_id, side, created_at").in("dispute_id", held).eq("kind", "reply").in("side", ["advertiser", "admin"]).order("created_at", { ascending: true }).limit(5000);
    const last = new Map();
    for (const e of talk ?? []) last.set(e.dispute_id, e.side);
    for (const [id, side] of last) if (side === "advertiser") need.add(id);
  }
  return need.size;
}

/** Unread notifications of the signed-in user (row-level security limits it to theirs). */
export function unreadCount(db, userId) {
  if (!userId) return 0;
  return count(db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null));
}
