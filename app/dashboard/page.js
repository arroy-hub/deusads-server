import { redirect } from "next/navigation";
import { getMember } from "../../lib/admin";
import { loadOverview } from "../../lib/advertiser-data";
import { parseRange } from "../../lib/reports";
import AdvertiserOverview from "./advertiser-overview";
import { homeFor } from "../../lib/nav";
import { loadDeckLayout } from "../../lib/deck-layout-data";
import { userClient } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  if (me.role === "admin") redirect(homeFor("admin"));
  // A developer's starting page is Home (/dashboard/home); the Overview is the advertiser's page of numbers.
  if (me.role !== "advertiser") redirect(homeFor("developer"));
  const query = await searchParams;
  return <AdvertiserHome me={me} days={parseRange(query?.days)} />;
}

async function AdvertiserHome({ me, days }) {
  const data = await loadOverview(me.service, me, days);
  const deckLayout = await loadDeckLayout(await userClient(), "advertiser");
  return <AdvertiserOverview data={data} basePath="/dashboard" deckLayout={deckLayout} />;
}
