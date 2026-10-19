// Traffic: the figures for the board over `traffic` (lib/traffic.js trafficTable). Pure.
import { TRAFFIC_RULES } from "./traffic.js";
import { bars, ring, stats, pct, RED, AMBER, GREEN, GREY, ORANGE } from "./admin-stats.js";

export const LEVEL_LABEL = { high: "Look closely", watch: "Worth a look", few: "Too few views", ok: "Fine" };
export const LEVEL_RANK = { high: 0, watch: 1, few: 2, ok: 3 };
export const TRAFFIC_GROUPS = [["o", "Overview"], ["g", "Games"], ["r", "Rules"]];
export const TRAFFIC_DEFAULTS = ["t_sum", "t_lv", "t_rule", "t_top"];

const num = (n) => n.toLocaleString("en-US").replace(/,/g, " ");

export function trafficWidgets(traffic) {
  const { games, totals } = traffic;
  const count = (lv) => games.filter((g) => g.level === lv).length;
  const mostly = new Map();
  for (const g of games) {
    const top = TRAFFIC_RULES.filter((r) => g.rules[r.id] > 0).sort((a, b) => g.rules[b.id] - g.rules[a.id])[0];
    if (top) mostly.set(top.label, (mostly.get(top.label) ?? 0) + 1);
  }
  return [
    { k: "t_sum", g: "o", t: "Marked views", w: 6, info: "Views that break at least one rule. They are only marked: nothing is hidden and every report keeps its numbers.", data: stats([["Views", num(totals.views)], ["Marked", num(totals.flagged), totals.flagged > 0], ["Share", pct(totals.share)]]) },
    { k: "t_lv", g: "o", t: "Games by verdict", w: 4, info: "How many games look fine, are worth a look, or deserve a close look. A game needs 50 views in the period before its share says anything.", data: ring([["Look closely", count("high"), RED], ["Worth a look", count("watch"), AMBER], ["Too few views", count("few"), GREY], ["Fine", count("ok"), GREEN]], "games") },
    { k: "t_share", g: "g", t: "Highest share of marked views", w: 6, info: "Games with the largest share of marked views, among those with enough views to say.", data: bars(games.filter((g) => g.level !== "few" && g.flagged > 0).sort((a, b) => b.share - a.share).slice(0, 5).map((g) => [g.name, Math.round(g.share * 1000) / 10, pct(g.share)]), RED, "No game stands out.") },
    { k: "t_top", g: "g", t: "Most marked views", w: 6, info: "Games with the most marked views, whatever their share.", data: bars(games.filter((g) => g.flagged > 0).slice(0, 5).map((g) => [g.name, g.flagged, num(g.flagged)]), ORANGE, "Nothing is marked.") },
    { k: "t_most", g: "g", t: "What games are marked for", w: 6, info: "For each game with marks, the rule that marks most of its views. Counted by game.", data: bars([...mostly.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), AMBER, "Nothing is marked.") },
    { k: "t_rule", g: "r", t: "Views by rule", w: 6, info: "How many views broke each rule. A view that breaks two rules counts once in the total and once under each rule.", data: bars(totals.rules.filter((r) => r.count > 0).sort((a, b) => b.count - a.count).map((r) => [r.label, r.count, num(r.count)]), ORANGE, "Nothing is marked.") },
  ];
}
