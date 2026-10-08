// Pure helpers for the game analytics block: no React, no database, so they can
// be tested on their own (test/analytics.test.mjs).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

/** The last `count` UTC calendar days, oldest first, as YYYY-MM-DD. */
export function lastDays(count, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    days.push(new Date(today - back * DAY_MS).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Rows from game_daily() only contain days that had impressions. The chart wants
 * every day in the window, so quiet days become explicit zeros.
 */
export function fillDays(rows, count, now = new Date()) {
  const byDay = new Map((rows ?? []).map((row) => [String(row.day).slice(0, 10), row]));
  return lastDays(count, now).map((date) => {
    const row = byDay.get(date);
    return {
      date,
      impressions: Number(row?.impressions ?? 0),
      sessions: Number(row?.sessions ?? 0),
    };
  });
}

/** The top of the y axis: a clean number at or above the peak, never below 4. */
export function niceMax(peak) {
  if (!(peak > 4)) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const lead = peak / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => lead <= candidate);
  return step * magnitude;
}

/** "2026-09-10" -> "10 Sep" (fixed English month names: the same on server and client). */
export function formatDay(date) {
  const [, month, day] = String(date).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
}

export function formatCount(value) {
  return Number(value).toLocaleString("en-US");
}

/**
 * One table row per live placement (including ones with no impressions yet),
 * busiest first. Impressions that belong to placements since removed from the
 * game are kept, folded into a single last row, so the table still adds up.
 */
export function placementRows(live, stats) {
  const byId = new Map((stats ?? []).map((item) => [item.placement_id, item]));
  const liveIds = new Set(live.map((placement) => placement.id));

  const rows = live
    .map((placement) => {
      const item = byId.get(placement.id);
      return {
        id: placement.id,
        label: placement.label || placement.external_id,
        scene: placement.scene || "",
        impressions: Number(item?.impressions ?? 0),
        sessions: Number(item?.sessions ?? 0),
        avgVisible: item?.avg_visible_seconds == null ? null : Number(item.avg_visible_seconds),
        removed: false,
      };
    })
    .sort((a, b) => b.impressions - a.impressions || a.label.localeCompare(b.label));

  const gone = (stats ?? []).filter((item) => !liveIds.has(item.placement_id));
  if (gone.length > 0) {
    rows.push({
      id: "removed",
      label: "Removed placements",
      scene: "",
      impressions: gone.reduce((sum, item) => sum + Number(item.impressions), 0),
      sessions: null, // distinct sessions cannot be added up across placements
      avgVisible: null,
      removed: true,
    });
  }
  return rows;
}
