import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { loadTraffic } from "../../../../lib/traffic";
import { WALLET_MIGRATION } from "../../../../lib/wallet";
import { loadPlatformWallet } from "../../../../lib/wallet-data";
import WindowTop, { PlateIcon } from "../../window-top";
import { TestMark } from "../../wallet/parts";
import PlatformWallet from "./platform-wallet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet" };

const SUB = "What DeusADS keeps: 20% of every credit advertisers pay for impressions.";
const TRAFFIC_DAYS = 90;

/** The platform's wallet: what advertisers paid, what went to developers and what DeusADS kept. Admins only (the layout checks). */
export default async function PlatformWalletPage({ searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const query = (await searchParams) ?? {};

  const [wallet, traffic] = await Promise.all([
    loadPlatformWallet(admin.service),
    // impressions the Traffic page marked as suspicious (migration 0040); without it the box says so
    loadTraffic(() => admin.service.rpc("traffic_by_game", { p_days: TRAFFIC_DAYS })).catch(() => ({ missing: true })),
  ]);
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
  const marked = traffic.missing ? null : { impressions: traffic.totals.flagged, share: traffic.totals.share, days: TRAFFIC_DAYS };
  const tab = ["advertisers", "developers"].includes(query.tab) ? query.tab : "overview";
  return <PlatformWallet wallet={wallet} marked={marked} sub={SUB} initialTab={tab} />;
}
