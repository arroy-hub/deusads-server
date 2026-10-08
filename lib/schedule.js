// Starts and ends bookings on their dates. The database function
// sync_booking_schedule() (migration 0013) does the work; GET /v1/manifest calls this
// before it answers, so a booking whose day has come is on the placement the next
// time any player starts the game, with no cron job to run. At most once a minute per
// server instance; it never throws and never delays the manifest on a failure.

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
