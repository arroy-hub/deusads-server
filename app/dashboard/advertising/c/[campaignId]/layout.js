import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/admin";
import { canAdvertise } from "../../../../../lib/admin-rules";
import { loadCampaignHead } from "../../../../../lib/advertiser-data";
import { categoryLabel } from "../../../../../lib/categories";
import { StatusPill } from "../../../advertiser-overview";
import CategoryIcon from "../../category-icon";
import CampaignTabs from "./campaign-tabs";
import HeaderActions from "./header-actions";

export const dynamic = "force-dynamic";

/** The header every page of a campaign shares: where it stands, its dates and audience, the buttons, and the four tabs. */
export default async function CampaignLayout({ children, params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const head = await loadCampaignHead(me.service, me, campaignId);
  if (!head) notFound();

  const details = [head.dates, head.audience || (head.bookings.length ? "Every game" : "")].filter(Boolean);
  const open = head.bookings.some((booking) => booking.status === "approved" || booking.status === "pending");

  return (
    <>
      <div className="ch">
        <div className="ch-main">
          <p className="ch-crumb">
            <Link href="/dashboard/advertising">Campaigns</Link> / {head.name}
          </p>
          <div className="ch-title">
            <CategoryIcon category={head.category} label={head.category ? categoryLabel(head.category) : "No category yet"} />
            <h1>{head.name}</h1>
            <StatusPill status={head.status} />
          </div>
          {details.length > 0 && <p className="ch-details">{details.join(" · ")}</p>}
        </div>
        <HeaderActions id={head.id} paused={head.paused} canPause={open} rules={head.rules} draft={head.bookings.length === 0} />
      </div>
      <CampaignTabs id={head.id} creatives={head.creativeCount} />
      {children}
    </>
  );
}
