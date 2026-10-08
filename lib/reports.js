// Pure helpers for the advertiser report (no React, no database; see
// test/reports.test.mjs).

export const REPORT_RANGES = [7, 30, 90];

/** The range from ?days=, falling back to 30. */
export function parseRange(value) {
  const days = Number(value);
  return REPORT_RANGES.includes(days) ? days : 30;
}

/**
 * One table row per (placement, creative) the advertiser has run: every booking
 * that is live, plus any pair that had impressions in the range (an earlier,
 * since-stopped booking still shows what it delivered). Impressions whose booking
 * has been deleted are folded into one last row so the table still adds up.
 * Busiest first.
 */
export function reportRows(bookings, stats) {
  const keyOf = (placementId, creativeId) => `${placementId}|${creativeId}`;
  const statOf = new Map((stats ?? []).map((item) => [keyOf(item.placement_id, item.creative_id), item]));

  // bookings arrive newest first; the newest booking names a (placement, creative) pair
  const byPair = new Map();
  for (const booking of bookings) {
    const key = keyOf(booking.placementId, booking.creativeId);
    if (!byPair.has(key)) byPair.set(key, booking);
  }

  const rows = [];
  for (const [key, booking] of byPair) {
    const item = statOf.get(key);
    if (!item && booking.status !== "approved") continue;
    rows.push({
      id: key,
      game: booking.game,
      placement: booking.placement,
      label: `${booking.game} · ${booking.placement}`,
      scene: booking.scene,
      creative: booking.creativeName,
      campaign: booking.campaign,
      live: booking.status === "approved",
      status: booking.status,
      impressions: Number(item?.impressions ?? 0),
      sessions: Number(item?.sessions ?? 0),
      avgVisible: item?.avg_visible_seconds == null ? null : Number(item.avg_visible_seconds),
    });
  }
  rows.sort((a, b) => b.impressions - a.impressions || a.label.localeCompare(b.label));

  const orphans = (stats ?? []).filter((item) => !byPair.has(keyOf(item.placement_id, item.creative_id)));
  if (orphans.length > 0) {
    rows.push({
      id: "removed",
      game: "",
      placement: "",
      label: "Removed bookings",
      scene: "",
      creative: "",
      campaign: "",
      live: false,
      impressions: orphans.reduce((sum, item) => sum + Number(item.impressions), 0),
      sessions: null, // distinct sessions cannot be added up across rows
      avgVisible: null,
    });
  }
  return rows;
}
