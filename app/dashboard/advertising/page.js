import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadCampaignList } from "../../../lib/advertiser-data";
import { canAdvertise } from "../../../lib/admin-rules";
import CampaignsListV2 from "./campaigns-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function AdvertisingPage() {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const { campaigns, error, rules } = await loadCampaignList(me.service, me, 30);

  return <CampaignsListV2 campaigns={campaigns} error={bookingsMissing(error)} rules={rules} />;
}
