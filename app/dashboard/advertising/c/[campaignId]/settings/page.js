import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignHead } from "../../../../../../lib/advertiser-data";
import SettingsForm from "./settings-form";
import CampaignAudience from "./campaign-audience";
import { PauseButton, DuplicateButton } from "../../../campaign-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign settings" };

export default async function CampaignSettingsPage({ params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const head = await loadCampaignHead(me.service, me, campaignId);
  if (!head) notFound();
  // The games that have opened placements, so the audience editor can say how many fit.
  let catalog = null;
  if (head.rules) {
    let openQuery = me.service.from("placements").select("game_id, games(genres, platforms, languages)").eq("open_to_advertisers", true).is("removed_at", null);
    if (me.role !== "admin") openQuery = openQuery.neq("owner_id", me.user.id);
    const { data: open, error } = await openQuery;
    if (!error) {
      const byGame = new Map();
      for (const row of open ?? []) if (row.games && !byGame.has(row.game_id)) byGame.set(row.game_id, row.games);
      catalog = [...byGame.values()];
    }
  }
  const hasOpen = head.bookings.some((booking) => booking.status === "pending" || booking.status === "approved");
  const closed = head.bookings.filter((booking) => booking.status !== "pending" && booking.status !== "approved").length;

  return (
    <div className="stack">
      <SettingsForm id={head.id} name={head.name} starts={head.starts ?? ""} ends={head.ends ?? ""} hasOpen={hasOpen} closedBookings={closed} />
      <section className="panel stack" aria-labelledby="run-title">
        <h2 id="run-title">Running</h2>
        {head.rules ? (
          <>
            <p className="settings-help">
              {head.paused ? "The campaign is paused: its ads are not shown in any game." : "Pause stops the ads in every game until you resume. Placements, dates and figures stay."}
            </p>
            <div className="row">
              {hasOpen && <PauseButton id={head.id} paused={head.paused} />}
              <DuplicateButton id={head.id} />
            </div>
          </>
        ) : (
          <p className="notice">Pause, duplicate and the campaign audience need migration <code>0026_campaign_rules.sql</code> in the Supabase SQL editor.</p>
        )}
      </section>
      {head.rules && <CampaignAudience campaignId={head.id} initial={head.targeting} catalog={catalog} />}
    </div>
  );
}
