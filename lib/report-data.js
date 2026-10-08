import { loadBookings } from "./bookings-data";
import { fillDays } from "./analytics";
import { reportRows } from "./reports";

/**
 * Everything the advertiser report (page and CSV download) shows, for one
 * advertiser: `campaignParam` is the raw ?campaign= value and only counts when it
 * is one of the advertiser's own campaigns.
 */
export async function loadReport(service, advertiserId, { days, campaignParam }) {
  const { bookings, error } = await loadBookings(service, (rows) => rows.eq("advertiser_id", advertiserId), {
    limit: 500,
  });

  const campaigns = [...new Map(bookings.map((b) => [b.campaignId, b.campaign])).entries()];
  const campaignId = campaigns.some(([id]) => id === campaignParam) ? campaignParam : null;
  const scoped = campaignId ? bookings.filter((b) => b.campaignId === campaignId) : bookings;

  const args = { p_advertiser: advertiserId, p_days: days, p_campaign: campaignId };
  const [totalsResult, dailyResult, placementResult] = await Promise.all([
    service.rpc("advertiser_totals", args),
    service.rpc("advertiser_daily", args),
    service.rpc("advertiser_placement_stats", args),
  ]);

  return {
    error,
    missing: [totalsResult, dailyResult, placementResult].some((result) => result.error),
    campaigns,
    campaignId,
    totals: totalsResult.data?.[0] ?? { impressions: 0, sessions: 0, avg_visible_seconds: null, placements: 0 },
    series: fillDays(dailyResult.data, days),
    rows: reportRows(scoped, placementResult.data),
  };
}
