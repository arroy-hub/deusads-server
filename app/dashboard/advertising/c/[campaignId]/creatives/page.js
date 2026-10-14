import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignReport, loadCreativeLibrary } from "../../../../../../lib/advertiser-data";
import { planCreativeIds } from "../../../../../../lib/campaign-plan";
import CampaignCreatives from "./campaign-creatives";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign creatives" };

export default async function CampaignCreativesPage({ params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const [report, library] = await Promise.all([loadCampaignReport(me.service, me, campaignId, 30), loadCreativeLibrary(me.service, me)]);
  if (!report) notFound();

  // The creatives of the bookings, and those a campaign started by audience still has to book.
  const planned = planCreativeIds(report.campaign.plan);
  const ids = [...new Set([...report.bookings.map((booking) => booking.creativeId), ...planned])];
  const byId = new Map(library.creatives.map((item) => [item.id, item]));
  // Impressions and view time of each creative in this campaign, from the placement figures.
  const figures = new Map();
  for (const item of report.placementStats) {
    const entry = figures.get(item.creative_id) ?? { impressions: 0, weighted: 0, weight: 0 };
    const count = Number(item.impressions) || 0;
    entry.impressions += count;
    if (item.avg_visible_seconds != null) {
      entry.weighted += Number(item.avg_visible_seconds) * count;
      entry.weight += count;
    }
    figures.set(item.creative_id, entry);
  }
  const openOf = (id) => report.bookings.filter((booking) => booking.creativeId === id && (booking.status === "approved" || booking.status === "pending")).length;

  const list = ids
    .map((id) => {
      const item = byId.get(id);
      if (!item) return null;
      const figure = figures.get(id);
      return {
        id,
        name: item.name,
        url: item.url,
        status: item.status,
        note: item.note,
        ready: item.formats.map((format) => format.ready),
        formatIds: item.formats.map((format) => format.id),
        impressions: figure?.impressions ?? 0,
        avg: figure && figure.weight > 0 ? figure.weighted / figure.weight : null,
        blocked: [...new Set(report.bookings.filter((booking) => booking.creativeId === id && booking.controlNote).map((booking) => booking.game))],
        longer: Boolean(report.creativeRows.find((row) => row.id === id)?.longer),
        removable: openOf(id) > 0 || planned.includes(id),
      };
    })
    .filter(Boolean);
  const draft = report.status.key === "draft";

  return <CampaignCreatives id={campaignId} list={list} library={library.creatives} draft={draft} />;
}
