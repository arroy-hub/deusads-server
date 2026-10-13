// The "Since your last visit" summary on My games, worked out from plain rows. Pure, so it can be tested.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Lines of the summary: [{ text, href, warn }].
 *   games       [{ id, name, mode }]  mode is the SDK connection ("ok" | "new" | "silent")
 *   bookings    [{ game_id, campaign_id, creative_id, created_at }] every booking in the developer's games
 *   placements  [{ game_id, first_seen_at }] placements still in their games
 *   disputes    [{ creative, outcome, resolved_at }] reports of theirs that were reviewed
 *   since       ISO time the previous visit ended
 */
export function buildDigest({ games, bookings = [], placements = [], disputes = [], since }) {
  const from = Date.parse(since);
  const lines = [];
  for (const game of games) {
    const mine = bookings.filter((row) => row.game_id === game.id);
    const firstCampaign = new Map();
    const firstCreative = new Map();
    for (const row of mine) {
      const at = Date.parse(row.created_at);
      if (!(at >= (firstCampaign.get(row.campaign_id) ?? Infinity))) firstCampaign.set(row.campaign_id, at);
      if (!(at >= (firstCreative.get(row.creative_id) ?? Infinity))) firstCreative.set(row.creative_id, at);
    }
    const newCampaigns = [...firstCampaign.values()].filter((at) => at > from).length;
    // A creative is "new in an old campaign" when its campaign was already there.
    const campaignOfCreative = new Map(mine.map((row) => [row.creative_id, row.campaign_id]));
    const newCreatives = [...firstCreative].filter(([id, at]) => at > from && firstCampaign.get(campaignOfCreative.get(id)) <= from).length;
    const parts = [];
    if (newCampaigns) parts.push(plural(newCampaigns, "new campaign", "new campaigns"));
    if (newCreatives) parts.push(`${plural(newCreatives, "new creative", "new creatives")}${newCampaigns ? "" : " in an existing campaign"}`);
    if (parts.length) lines.push({ text: `${parts.join(" and ")} in ${game.name}`, href: `/dashboard/g/${game.id}?tab=campaigns`, warn: false });

    const found = placements.filter((row) => row.game_id === game.id && Date.parse(row.first_seen_at) > from).length;
    if (found) lines.push({ text: `${plural(found, "new placement", "new placements")} found after Send placements in ${game.name}`, href: `/dashboard/g/${game.id}?tab=placements`, warn: false });
  }
  for (const dispute of disputes) {
    if (!(Date.parse(dispute.resolved_at) > from)) continue;
    lines.push({
      text: `DeusADS reviewed your report on “${dispute.creative}”: ${dispute.outcome === "removed" ? "creative removed" : "report dismissed"}`,
      href: null,
      warn: false,
    });
  }
  for (const game of games) {
    if (game.mode === "silent") lines.push({ text: `${game.name} hasn't synced for ${game.days} days.`, href: `/dashboard/g/${game.id}?tab=settings`, warn: true });
  }
  return lines;
}
