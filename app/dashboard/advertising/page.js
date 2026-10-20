import { notFound } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { canAdvertise } from "../../../lib/admin-rules";
import AdvertiserWindow from "./advertiser-window";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function AdvertisingPage({ searchParams }) {
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const { tab } = await searchParams;
  return <AdvertiserWindow me={me} tab={tab === "creatives" ? "cr" : "camp"} />;
}
