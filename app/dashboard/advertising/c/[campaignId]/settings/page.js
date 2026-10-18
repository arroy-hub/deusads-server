import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignHead } from "../../../../../../lib/advertiser-data";
import SettingsForm from "./settings-form";
import CampaignAudience from "./campaign-audience";
import { DuplicateButton } from "../../../campaign-actions";
import { parseCover, COVERS, defaultCoverId } from "../../../../../../lib/game-cover";
import { coverSeed } from "../../../../../../lib/campaign-cover";
import { hasTargeting, labelOf } from "../../../../../../lib/targeting";

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
    openQuery = openQuery.neq("owner_id", me.user.id); // the server never books an advertiser on their own games, admin or not
    const { data: open, error } = await openQuery;
    if (!error) {
      const byGame = new Map();
      for (const row of open ?? []) if (row.games && !byGame.has(row.game_id)) byGame.set(row.game_id, row.games);
      catalog = [...byGame.values()];
    }
  }
  const hasOpen = head.bookings.some((booking) => booking.status === "pending" || booking.status === "approved");
  const closed = head.bookings.filter((booking) => booking.status !== "pending" && booking.status !== "approved").length;

  const saved = parseCover(head.cover.value);
  const chips = [];
  const targeting = hasTargeting(head.targeting) ? head.targeting : null;
  for (const id of targeting?.genres ?? []) chips.push({ key: `g:${id}`, text: labelOf("genres", id) });
  for (const id of targeting?.platforms ?? []) chips.push({ key: `p:${id}`, text: labelOf("platforms", id).replace(/ \(.*\)$/, "") });
  for (const id of targeting?.languages ?? []) chips.push({ key: `l:${id}`, text: labelOf("languages", id) });
  for (const id of targeting?.exclude_genres ?? []) chips.push({ key: `x:${id}`, text: `not ${labelOf("genres", id)}` });
  const card = {
    chips,
    category: head.category,
    creatives: head.creativeCount,
    games: new Set(head.bookings.map((booking) => booking.gameId).filter(Boolean)).size,
    placements: new Set(head.bookings.map((booking) => booking.placementId).filter(Boolean)).size,
  };

  const duplicate = head.rules ? (
    <section className="cs-card cs-rows" aria-label="Duplicate">
      <div className="cs-row">
        <div>
          <h2>Duplicate the campaign</h2>
          <p>Starts a new draft with the same creatives, audience and placements. Dates are left empty.</p>
        </div>
        <DuplicateButton id={head.id} />
      </div>
    </section>
  ) : (
    <section className="cs-card cs-rows" aria-label="Duplicate">
      <p className="notice">Pause, duplicate and the campaign audience need migration <code>0026_campaign_rules.sql</code> in the Supabase SQL editor.</p>
    </section>
  );

  return (
    <div className="cs-wrap cs-wide">
      <SettingsForm
        id={head.id}
        name={head.name}
        starts={head.starts ?? ""}
        ends={head.ends ?? ""}
        status={head.status}
        hasOpen={hasOpen}
        closedBookings={closed}
        rules={head.rules}
        card={card}
        cover={{
          ready: head.cover.ready,
          css: head.coverCss,
          defaultId: defaultCoverId(coverSeed(head.id)),
          colourId: saved.kind === "preset" ? saved.id : defaultCoverId(coverSeed(head.id)),
          imageUrl: saved.kind === "image" ? "yes" : saved.kind === "default" ? head.firstUrl : "",
        }}
        audience={head.rules ? <CampaignAudience campaignId={head.id} initial={head.targeting} catalog={catalog} /> : null}
        duplicate={duplicate}
      />
    </div>
  );
}
