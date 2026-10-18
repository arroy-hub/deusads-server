import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/admin";
import { canAdvertise } from "../../../../../lib/admin-rules";
import { loadCampaignHead } from "../../../../../lib/advertiser-data";
import CampaignTop from "./campaign-top";

export const dynamic = "force-dynamic";

/** The header every page of a campaign shares: where it stands, its dates and audience, and the four tabs. */
export default async function CampaignLayout({ children, params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const head = await loadCampaignHead(me.service, me, campaignId);
  if (!head) notFound();

  return (
    <div className="gp">
      <CampaignTop
        h={{
          id: head.id,
          name: head.name,
          status: head.status,
          category: head.category,
          audience: head.audience,
          starts: head.starts,
          ends: head.ends,
          pausedUntil: head.pausedUntil,
          rules: head.rules,
          hasBookings: head.bookings.length > 0,
        }}
        creatives={head.creativeCount}
        coverCss={head.coverCss}
      />
      <div className="gp-work">{children}</div>
    </div>
  );
}
