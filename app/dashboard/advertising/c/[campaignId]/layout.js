import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../lib/admin";
import { canAdvertise } from "../../../../../lib/admin-rules";
import { loadCampaignHead } from "../../../../../lib/advertiser-data";
import { categoryLabel } from "../../../../../lib/categories";
import { StatusPill } from "../../../advertiser-overview";
import CategoryIcon from "../../category-icon";
import CampaignTabs from "./campaign-tabs";

export const dynamic = "force-dynamic";

/** The header every page of a campaign shares: where it stands, its dates and audience, and the four tabs. */
export default async function CampaignLayout({ children, params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const head = await loadCampaignHead(me.service, me, campaignId);
  if (!head) notFound();

  const details = [head.dates, head.audience || (head.bookings.length ? "Every game" : "")].filter(Boolean);

  return (
    <>
      <div className="main-head">
        <div>
          <p className="muted-line">
            <Link href="/dashboard/advertising" style={{ textDecoration: "underline" }}>
              Campaigns
            </Link>{" "}
            / {head.name}
          </p>
          <div className="row" style={{ marginTop: 4 }}>
            <CategoryIcon category={head.category} label={head.category ? categoryLabel(head.category) : "No category yet"} />
            <h1>{head.name}</h1>
            <StatusPill status={head.status} />
          </div>
          {details.length > 0 && <p className="muted-line" style={{ marginTop: 6 }}>{details.join(" · ")}</p>}
        </div>
        <Link href={`/dashboard/advertising/new?campaign=${head.id}`} className="button">
          Add placements
        </Link>
      </div>
      <CampaignTabs id={head.id} creatives={head.creativeCount} />
      {children}
    </>
  );
}
