import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignHead } from "../../../../../../lib/advertiser-data";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign settings" };

export default async function CampaignSettingsPage({ params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const head = await loadCampaignHead(me.service, me, campaignId);
  if (!head) notFound();
  const closed = head.bookings.filter((booking) => booking.status !== "pending" && booking.status !== "approved").length;

  return (
    <div className="stack">
      <SettingsForm id={head.id} name={head.name} starts={head.starts ?? ""} ends={head.ends ?? ""} hasOpen={head.bookings.some((booking) => booking.status === "pending" || booking.status === "approved")} closedBookings={closed} />
      <section className="panel" aria-labelledby="aud-title">
        <h2 id="aud-title">Audience</h2>
        <p className="settings-help" style={{ marginTop: 6 }}>
          {head.audience ? `Shown in games that are: ${head.audience}.` : "Shown in every game."} The audience is set on each creative: open a creative and choose “Who may see it”.
        </p>
        <p style={{ marginTop: 10 }}>
          <Link href="/dashboard/creatives" className="button button-quiet">
            Open your creatives
          </Link>
        </p>
      </section>
    </div>
  );
}
