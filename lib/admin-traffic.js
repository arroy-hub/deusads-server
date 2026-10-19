// Traffic: the figures for the board over `traffic` (lib/traffic.js trafficTable). Pure.
import { TRAFFIC_RULES } from "./traffic.js";
import { bars, ring, stats, pct, RED, AMBER, GREEN, GREY, ORANGE, BLUE } from "./admin-stats.js";

export const LEVEL_LABEL = { high: "Look closely", watch: "Worth a look", few: "Too few views to say", ok: "Looks normal" };
export const LEVEL_RANK = { high: 0, watch: 1, few: 2, ok: 3 };
export const TRAFFIC_GROUPS = [["o", "Overview"], ["y", "Why views are marked"]];
export const TRAFFIC_DEFAULTS = ["tsum", "tlv", "trule", "tshare"];

const num = (n) => n.toLocaleString("en-US").replace(/,/g, " ");
const topRule = (g) => TRAFFIC_RULES.filter((r) => g.rules[r.id] > 0).sort((a, b) => g.rules[b.id] - g.rules[a.id])[0];

/** The mockup's TW catalog over `traffic`. The "Marked share per day" widget of the mockup is left out: there is no per-day series to draw it from. */
export function trafficWidgets(traffic) {
  const { games, totals } = traffic;
  const count = (lv) => games.filter((g) => g.level === lv).length;
  const look = games.filter((g) => g.level === "high" || g.level === "watch").length;
  const mostly = new Map();
  for (const g of games.filter((x) => x.level !== "few")) {
    const top = topRule(g);
    if (top) mostly.set(top.label, (mostly.get(top.label) ?? 0) + 1);
  }
  return [
    { k: "tsum", g: "o", t: "Marked views", w: 6, info: "Views and marked views for the selected period. A mark is a reason to look, not proof.", data: stats([["Views", num(totals.views)], ["Marked", num(totals.flagged)], ["Share", pct(totals.share)], ["Games to look at", `${look} of ${games.length}`, look > 0]]) },
    { k: "tlv", g: "o", t: "Games by verdict", w: 4, info: "How many games fall into each verdict.", data: ring([["Look closely", count("high"), RED], ["Worth a look", count("watch"), AMBER], ["Looks normal", count("ok"), GREEN], ["Too few views", count("few"), GREY]], "games") },
    { k: "tshare", g: "o", t: "Marked share by game", w: 6, info: "Share of each game's views that were marked. Games with too few views are left out.", data: bars(games.filter((g) => g.level !== "few" && g.flagged > 0).sort((a, b) => b.share - a.share).slice(0, 5).map((g) => [g.name, g.share, pct(g.share)]), RED, "No game stands out.") },
    { k: "tmost", g: "o", t: "Most marked views", w: 6, info: "Games with the largest number of marked views, whatever the share.", data: bars(games.filter((g) => g.flagged > 0).slice(0, 5).map((g) => [g.name, g.flagged, num(g.flagged)]), ORANGE, "Nothing is marked.") },
    { k: "trule", g: "y", t: "Why views were marked", w: 6, info: "Marked views by the rule they broke. A view that breaks two rules counts under each.", data: bars(totals.rules.filter((r) => r.count > 0).sort((a, b) => b.count - a.count).map((r) => [r.label, r.count, num(r.count)]), ORANGE, "Nothing is marked.") },
    { k: "ttop", g: "y", t: "Main reason per game", w: 6, info: "For each game, the rule that marked most of its views. Shown as the number of games per rule.", data: bars([...mostly.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), BLUE, "Nothing is marked.") },
  ];
}
