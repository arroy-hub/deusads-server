import { getMember } from "../../../../../lib/admin";
import { toCsv } from "../../../../../lib/csv";
import { loadReport } from "../../../../../lib/report-data";
import { parseRange } from "../../../../../lib/reports";

export const dynamic = "force-dynamic";

const text = (body, status) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * GET /dashboard/advertising/reports/export?kind=placements|daily&days=30&campaign=<id>
 * The report the page shows, as a CSV download. Only for the signed-in advertiser's
 * own figures; the same rules as the page decide what is in it.
 */
export async function GET(request) {
  const me = await getMember();
  if (!me) return text("Sign in first.", 401);
  if (me.role !== "advertiser") return text("Not allowed.", 403);

  const params = new URL(request.url).searchParams;
  const days = parseRange(params.get("days"));
  const kind = params.get("kind") === "daily" ? "daily" : "placements";
  const report = await loadReport(me.service, me.user.id, { days, campaignParam: params.get("campaign") });
  if (report.missing) return text("Reports are not ready: run the latest migrations.", 503);

  const rows =
    kind === "daily"
      ? toCsv(
          ["Day (UTC)", "Impressions", "Sessions"],
          report.series.map((day) => [day.date, day.impressions, day.sessions])
        )
      : toCsv(
          ["Game", "Placement", "Scene", "Creative", "Campaign", "Status", "Impressions", "Sessions", "Avg visible (s)"],
          report.rows.map((row) => [
            row.game,
            row.placement || row.label,
            row.scene,
            row.creative,
            row.campaign,
            row.id === "removed" ? "" : row.status,
            row.impressions,
            row.sessions,
            row.avgVisible,
          ])
        );

  const name = `deusads-${kind}-${days}d.csv`;
  return new Response(rows, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
