import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadCampaignList } from "../../../lib/advertiser-data";
import { categoryLabel } from "../../../lib/categories";
import { formatCount } from "../../../lib/analytics";
import { canAdvertise } from "../../../lib/admin-rules";
import CategoryIcon from "./category-icon";
import RowMenu from "./row-menu";
import SectionTabs from "./section-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function AdvertisingPage() {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const { campaigns, creativeCount, error } = await loadCampaignList(me.service, me, 30);

  return (
    <>
      <div className="main-head">
        <h1>Campaigns</h1>
        <Link href="/dashboard/advertising/new" className="button">
          New campaign
        </Link>
      </div>
      <p className="lede">Your campaigns and where each one stands.</p>

      <SectionTabs active="campaigns" campaigns={campaigns.length} creatives={creativeCount} />

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to turn bookings on.
        </p>
      )}

      {campaigns.length === 0 && !error ? (
        <div className="empty cl-empty">
          <h2>No campaigns yet</h2>
          <p>A campaign is a creative, the games it runs in and the dates. Set one up in four short steps; ads start once the creative is approved.</p>
          <Link href="/dashboard/advertising/new" className="button">
            Start your first campaign
          </Link>
        </div>
      ) : (
        <section className="panel cl-panel" aria-label="Campaigns">
          <div className="ov-table-wrap">
            <div className="cl-row cl-head" role="row">
              <span>Campaign</span>
              <span>Dates</span>
              <span>Status</span>
              <span>Audience</span>
              <span className="cl-num">Impressions, 30 days</span>
              <span />
            </div>
            {campaigns.map((campaign) => (
              <div className="cl-row" key={campaign.id} role="row">
                <span className="cl-name">
                  <CategoryIcon category={campaign.category} label={campaign.category ? categoryLabel(campaign.category) : "No category yet"} />
                  <Link href={`/dashboard/advertising/c/${campaign.id}`}>{campaign.name}</Link>
                </span>
                <span className="cl-muted">{campaign.dates || "Not set"}</span>
                <span>
                  <span className={`ov-pill ov-${campaign.status.key}`}>{campaign.status.label}</span>
                </span>
                <span className="cl-muted">{campaign.audience || (campaign.bookings ? "Every game" : "Not chosen yet")}</span>
                <span className="cl-num">{campaign.impressions > 0 ? formatCount(campaign.impressions) : "—"}</span>
                <RowMenu id={campaign.id} name={campaign.name} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
