// Pure rules for campaigns and bookings, kept apart from React and the database so
// they can be tested on their own (test/booking.test.mjs). The database function
// decide_booking (migration 0009) applies the same status rule inside a transaction.

export const MAX_PLACEMENTS_PER_REQUEST = 50;

/** pending | approved | rejected, from the two sides' decisions. */
export function bookingStatus(adminDecision, developerDecision) {
  if (adminDecision === "rejected" || developerDecision === "rejected") return "rejected";
  if (adminDecision === "approved" && developerDecision === "approved") return "approved";
  return "pending";
}

/** What a booking is waiting for, in words the advertiser and developer both understand. */
export function bookingLabel({ status, admin_decision: admin, developer_decision: developer }) {
  if (status === "approved") return "Live";
  if (status === "rejected") return "Rejected";
  if (status === "cancelled") return "Cancelled";
  if (admin === "approved") return "Waiting for the developer";
  if (developer === "approved") return "Waiting for DeusADS review";
  return "Waiting for DeusADS review and the developer";
}

/** A campaign name: trimmed, capped at 120, null when empty. */
export function cleanCampaignName(value) {
  const text = String(value ?? "").trim().slice(0, 120);
  return text || null;
}

/** Unique, non-empty placement ids from whatever the browser sent; at most the cap. */
export function cleanPlacementIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_PLACEMENTS_PER_REQUEST);
}

/** Messages for the errors decide_booking / cancel_booking raise. */
export function bookingErrorMessage(error) {
  const text = String(error?.message ?? "");
  if (text.includes("BOOKING_NOT_FOUND")) return "This booking no longer exists.";
  if (text.includes("BOOKING_CLOSED")) return "This booking is already closed.";
  if (text.includes("CREATIVE_NOT_APPROVED")) return "The creative is no longer approved.";
  if (text.includes("PLACEMENT_TAKEN")) return "Another advertiser already holds this placement.";
  return "Could not save. Try again.";
}

/** True when a query failed because migration 0009 has not been run. */
export function bookingsMissing(error) {
  return Boolean(error) && ["42P01", "PGRST205", "PGRST202"].includes(error.code);
}
