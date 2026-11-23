import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { canAdvertise } from "../../../lib/admin-rules";
import { loadCampaignList } from "../../../lib/advertiser-data";
import { sortCampaigns } from "../../../lib/campaign-cards";
import { EARNINGS_PAGE } from "../../../lib/nav";
import { WALLET_MIGRATION } from "../../../lib/wallet";
import { loadAdvertiserWallet } from "../../../lib/wallet-data";
import WindowTop, { PlateIcon } from "../window-top";
import AdvertiserWallet from "./advertiser-wallet";
import { TestMark } from "./parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet" };

/** The advertiser's wallet: credits to spend, campaign budgets, operations. A developer's wallet is the earnings page. */
export default async function WalletPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  if (!canAdvertise(me.role)) redirect(EARNINGS_PAGE);
  const query = (await searchParams) ?? {};

  const list = await loadCampaignList(me.service, me, 30);
  const wallet = await loadAdvertiserWallet(me.service, me.user.id, list.campaigns);
  if (wallet.missing || wallet.failed) {
    return (
      <div className="gp">
        <WindowTop title="Wallet" titleExtra={<TestMark />} sub="Credits you add here pay for impressions in your campaigns." icon={<PlateIcon name="wallet" />} />
        <div className="gp-work">
          {wallet.missing
            ? <p className="notice">Run <code>supabase/migrations/{WALLET_MIGRATION}</code> in the Supabase SQL editor to turn the wallet on.</p>
            : <p className="notice">The wallet could not be loaded. Try again in a moment.</p>}
        </div>
      </div>
    );
  }

  // A draft has no budget and has spent nothing: it is not a line of the wallet yet.
  const campaigns = sortCampaigns(list.campaigns.filter((campaign) => campaign.status.key !== "draft" || !campaign.budget.unlimited || campaign.budget.spent > 0)).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    coverCss: campaign.coverCss,
    status: { key: campaign.status.key, label: campaign.status.label },
    starts: campaign.starts ?? null,
    ends: campaign.ends ?? null,
    budget: campaign.budget,
  }));

  return <AdvertiserWallet wallet={wallet} campaigns={campaigns} initialTab={query.tab === "history" ? "history" : "overview"} openTopUp={query.add === "1"} />;
}
