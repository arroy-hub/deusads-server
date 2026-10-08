import { formatDay } from "./analytics.js";

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

/** Today's UTC calendar day as YYYY-MM-DD (bookings run on UTC days). */
export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isRealDay = (value) => {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const MAX_BOOKING_DAYS = 366;

/**
 * Start and end days from the booking form. Both are optional: no start means "as
 * soon as approved", no end means "until stopped". The end day is the last day shown.
 * Returns { startsOn, endsOn } (null when empty) or { error }.
 */
export function parseDateRange(startsOn, endsOn, today = utcToday()) {
  const start = String(startsOn ?? "").trim() || null;
  const end = String(endsOn ?? "").trim() || null;
  if ((start && !isRealDay(start)) || (end && !isRealDay(end))) return { error: "Use real dates." };
  if (start && start < today) return { error: "The start date cannot be in the past." };
  if (end && end < (start ?? today)) return { error: "The end date must not be before the start date." };
  if (end) {
    const first = new Date(`${start ?? today}T00:00:00Z`).getTime();
    const days = (new Date(`${end}T00:00:00Z`).getTime() - first) / 86_400_000 + 1;
    if (days > MAX_BOOKING_DAYS) return { error: `A booking can run for at most ${MAX_BOOKING_DAYS} days.` };
  }
  return { startsOn: start, endsOn: end };
}

/** What a booking is waiting for, or how it is running, in words both sides understand. */
export function bookingLabel(booking, today = utcToday()) {
  const { status, admin_decision: admin, developer_decision: developer } = booking;
  const startsOn = booking.starts_on ?? booking.startsOn ?? null;
  const endsOn = booking.ends_on ?? booking.endsOn ?? null;
  if (status === "approved") {
    if (endsOn && endsOn < today) return "Ended";
    if (startsOn && startsOn > today) return `Scheduled from ${formatDay(startsOn)}`;
    return endsOn ? `Live until ${formatDay(endsOn)}` : "Live";
  }
  if (status === "ended") return "Ended";
  if (status === "rejected") return "Rejected";
  if (status === "cancelled") return "Cancelled";
  if (admin === "approved") return "Waiting for the developer";
  if (developer === "approved") return "Waiting for DeusADS review";
  return "Waiting for DeusADS review and the developer";
}

/** "12 Oct – 20 Oct", "from 12 Oct", "until 20 Oct", or "" when the booking has no dates. */
export function dateRangeText(startsOn, endsOn) {
  if (startsOn && endsOn) return `${formatDay(startsOn)} – ${formatDay(endsOn)}`;
  if (startsOn) return `from ${formatDay(startsOn)}`;
  if (endsOn) return `until ${formatDay(endsOn)}`;
  return "";
}

/**
 * A warning when a creative's proportions are far from the placement's, so the
 * image will be cropped; null when they are close or either is unknown.
 */
export function fitNote({ width, height, aspect }) {
  const ratio = Number(width) / Number(height);
  const target = Number(aspect);
  if (!(ratio > 0) || !(target > 0) || !Number.isFinite(ratio) || !Number.isFinite(target)) return null;
  if (Math.abs(ratio / target - 1) <= 0.15) return null;
  return `Image is ${ratio.toFixed(2)}:1, placement is ${target.toFixed(2)}:1: it will be cropped`;
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
  if (text.includes("BOOKING_EXPIRED")) return "This booking's end date has already passed.";
  if (text.includes("PLACEMENT_TAKEN")) return "Another advertiser already holds this placement.";
  return "Could not save. Try again.";
}

/** True when a query failed because migration 0009 has not been run. */
export function bookingsMissing(error) {
  return Boolean(error) && ["42P01", "PGRST205", "PGRST202"].includes(error.code);
}
