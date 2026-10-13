import { notFound } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { canAdvertise } from "../../../../lib/admin-rules";
import { loadOverview } from "../../../../lib/advertiser-data";
import { parseRange } from "../../../../lib/reports";
import AdvertiserOverview from "../../advertiser-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

// The advertiser's Home for an admin too: an admin has no Home of their own, so this is how they open it.
export default async function OverviewPage({ searchParams }) {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const query = await searchParams;
  const data = await loadOverview(me.service, me, parseRange(query?.days));
  return <AdvertiserOverview data={data} basePath="/dashboard/advertising/overview" />;
}
