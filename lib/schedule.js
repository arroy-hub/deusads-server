// Starts and ends bookings on their dates. The database function
// sync_booking_schedule() (migration 0013) does the work. Since migration 0049 the database runs it
// every minute by itself (pg_cron); GET /v1/manifest still asks for it, after it has answered, so a
// database without 0049 starts a booking at the next game start at the latest. At most once a
// minute per server instance; it never throws and never delays the manifest.

const MIN_GAP_MS = 60_000;
let lastRun = -Infinity;

export async function syncBookingSchedule(db, now = Date.now()) {
  if (now - lastRun < MIN_GAP_MS) return false;
  lastRun = now;
  try {
    if (typeof db?.rpc !== "function") return false;
    const { error } = await db.rpc("sync_booking_schedule");
    // Not there yet (0013 not applied): nothing to schedule, nothing to report.
    if (error && !["PGRST202", "42883"].includes(error.code)) {
      console.error("[DeusADS] booking schedule sync failed:", error.code, error.message);
    }
    return !error;
  } catch (error) {
    console.error("[DeusADS] booking schedule sync failed:", error?.message);
    return false;
  }
}

/** For tests: forget the last run so the next call goes through. */
export function resetScheduleThrottle() {
  lastRun = -Infinity;
}
