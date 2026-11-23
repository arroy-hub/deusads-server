import { redirect } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { WALLET_PAGE } from "../../../../lib/nav";
import { WALLET_MIGRATION } from "../../../../lib/wallet";
import { loadDeveloperWallet } from "../../../../lib/wallet-data";
import WindowTop, { PlateIcon } from "../../window-top";
import { TestMark } from "../parts";
import DeveloperWallet from "./developer-wallet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet" };

const SUB = "What your games have earned from advertisers’ campaigns.";

/** The developer's wallet: what the games earned. An advertiser has no games, so their wallet is the other page. */
export default async function EarningsPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  if (me.role === "advertiser") redirect(WALLET_PAGE);
  const query = (await searchParams) ?? {};

  const wallet = await loadDeveloperWallet(me.service, me.user.id);
  if (wallet.missing || wallet.failed) {
    return (
      <div className="gp">
        <WindowTop title="Wallet" titleExtra={<TestMark />} sub={SUB} icon={<PlateIcon name="wallet" />} />
        <div className="gp-work">
          {wallet.missing
            ? <p className="notice">Run <code>supabase/migrations/{WALLET_MIGRATION}</code> in the Supabase SQL editor to turn the wallet on.</p>
            : <p className="notice">The wallet could not be loaded. Try again in a moment.</p>}
        </div>
      </div>
    );
  }
  return <DeveloperWallet wallet={wallet} sub={SUB} initialTab={query.tab === "history" ? "history" : "overview"} />;
}
