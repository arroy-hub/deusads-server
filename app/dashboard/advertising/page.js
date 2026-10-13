import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadCampaignList } from "../../../lib/advertiser-data";
import { categoryLabel } from "../../../lib/categories";
import { formatCount } from "../../../lib/analytics";
import { canAdvertise } from "../../../lib/admin-rules";
import CategoryIcon from "./category-icon";
import StatusPill from "./status-pill";
import RowMenu from "./row-menu";
import SectionTabs from "./section-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function AdvertisingPage() {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const { campaigns, creativeCount, error, rules } = await loadCampaignList(me.service, me, 30);

  return (
    <>
      <div className="main-head">
        <div>
          <h1>Campaigns</h1>
          <p className="lede">Your campaigns and where each one stands.</p>
        </div>
        <Link href="/dashboard/advertising/new" className="button">
          New campaign
        </Link>
      </div>

      <SectionTabs active="campaigns" campaigns={campaigns.length || null} creatives={creativeCount || null} />

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to turn bookings on.
        </p>
      )}

      {campaigns.length === 0 && !error ? (
        <>
          <section className="panel cl-empty" aria-labelledby="cl-empty-title">
            <span className="cl-empty-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <div className="cl-empty-text">
              <h2 id="cl-empty-title">Start your first campaign</h2>
              <p>A campaign puts one creative in front of the games you choose. It takes a few minutes, and nothing goes live until your creative is approved.</p>
            </div>
            <Link href="/dashboard/advertising/new" className="button cl-empty-cta">
              Create a campaign
            </Link>
            <ol className="cl-steps">
              <li>
                <span className="cl-step-n">1</span>
                <span>
                  <strong>Add a creative</strong>
                  <span>Upload a PNG or JPG. We check it and help you cover every ad shape.</span>
                </span>
              </li>
              <li>
                <span className="cl-step-n">2</span>
                <span>
                  <strong>Choose where</strong>
                  <span>Pick the audience: genres, platforms and languages.</span>
                </span>
              </li>
              <li>
                <span className="cl-step-n">3</span>
                <span>
                  <strong>Set the dates and start</strong>
                  <span>Ads begin when the creative is approved. You can stop any time.</span>
                </span>
              </li>
            </ol>
          </section>
          <p className="cl-foot">Developers can pause or block an ad in their game; you will see where and why in the campaign report.</p>
        </>
      ) : (
        <section className="cp-panel" aria-label="Campaigns">
          <div className="cp-scroll">
            <div className="cp-grid cp-adv">
              <div className="cp-chead">
                <span>Campaign</span>
                <span>Status</span>
                <span>Dates</span>
                <span>Audience</span>
                <span className="cp-num">Impressions, 30 days</span>
                <span />
              </div>
              {campaigns.map((campaign) => (
                <div className={`cp-crow${campaign.status.key === "ended" ? " s-ended" : campaign.status.key === "paused" ? " s-paused" : ""}`} key={campaign.id}>
                  <div className="cp-cname">
                    <CategoryIcon category={campaign.category} label={campaign.category ? categoryLabel(campaign.category) : "No category yet"} />
                    <div>
                      <Link href={campaign.status.key === "draft" ? `/dashboard/advertising/new?campaign=${campaign.id}` : `/dashboard/advertising/c/${campaign.id}`}>
                        <strong>{campaign.name}</strong>
                      </Link>
                      <div className="cp-meta">{campaign.category ? categoryLabel(campaign.category) : "No category yet"}</div>
                    </div>
                  </div>
                  <div>
                    <StatusPill status={campaign.status} />
                  </div>
                  <div className="cp-meta">{campaign.dates || "Not set"}</div>
                  <div className="cp-meta">{campaign.audience || (campaign.launched || campaign.bookings ? "Every game" : "Not chosen yet")}</div>
                  <div className="cp-num">{campaign.impressions > 0 ? formatCount(campaign.impressions) : "—"}</div>
                  <div className="cp-acts">
                    <RowMenu id={campaign.id} name={campaign.name} draft={campaign.status.key === "draft"} paused={campaign.paused} canPause={campaign.canPause} rules={rules} />
                  </div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - campaigns.length) }, (_, index) => (
                <div className="cp-crow is-blank" key={`blank-${index}`} aria-hidden="true">
                  <div /><div /><div /><div /><div /><div />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
