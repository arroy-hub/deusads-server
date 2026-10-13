// Pure helpers for the Overview chart and its "By campaign" table (no React; see test/overview-chart.test.mjs).

import { deltaText } from "./advertiser-overview.js";

/** Colours of the campaign lines, in order. The table's checkbox carries the same colour, so a line is never found by colour alone. */
export const LINE_COLORS = ["#b4472e", "#1f4768", "#2f7d5b", "#8a5a9e", "#c28a1a", "#3b8c9e", "#a0436b", "#6b665f"];

export const colorOf = (index) => LINE_COLORS[index % LINE_COLORS.length];

/** Day-by-day numbers added up per calendar week of the period (7 days, the last bucket may be shorter). */
export function byWeek(values, dates) {
  const out = [];
  for (let start = 0; start < values.length; start += 7) {
    const slice = values.slice(start, start + 7);
    out.push({ date: dates[start], to: dates[Math.min(start + 6, dates.length - 1)], value: slice.reduce((sum, value) => sum + value, 0) });
  }
  return out;
}

/** The same shape for days, so the chart draws both the same way. */
export function byDay(values, dates) {
  return values.map((value, index) => ({ date: dates[index], to: dates[index], value }));
}

/** Adds series of equal length. */
export function sumSeries(list, length) {
  const total = Array.from({ length }, () => 0);
  for (const values of list) for (let i = 0; i < length; i += 1) total[i] += values[i] ?? 0;
  return total;
}

/**
 * The headline numbers for the chosen campaigns: impressions (with the change against the period before),
 * average view time weighted by impressions, total visible hours and the distinct games reached.
 */
export function selectionTotals(campaigns) {
  let impressions = 0;
  let previous = 0;
  let weighted = 0;
  let weight = 0;
  const games = new Set();
  for (const campaign of campaigns) {
    impressions += campaign.impressions;
    previous += campaign.previousDaily.reduce((sum, value) => sum + value, 0);
    if (campaign.avgVisible != null && campaign.impressions > 0) {
      weighted += campaign.avgVisible * campaign.impressions;
      weight += campaign.impressions;
    }
    for (const id of campaign.gameIds) games.add(id);
  }
  return {
    impressions,
    delta: deltaText(impressions, previous),
    avgVisible: weight > 0 ? weighted / weight : null,
    visibleHours: weight > 0 ? weighted / 3600 : null,
    games: games.size,
  };
}

/** Rows of the table in the chosen order. Missing numbers (a dash) always go last. */
export function sortCampaigns(campaigns, key, direction) {
  const value = (campaign) => {
    if (key === "name") return campaign.name.toLowerCase();
    if (key === "avgVisible") return campaign.avgVisible;
    if (key === "games") return campaign.games;
    if (key === "change") {
      const before = campaign.previousDaily.reduce((sum, v) => sum + v, 0);
      return before > 0 ? (campaign.impressions - before) / before : null;
    }
    return campaign.impressions;
  };
  const sign = direction === "asc" ? 1 : -1;
  return [...campaigns].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "string") return sign * x.localeCompare(y);
    return sign * (x - y);
  });
}
