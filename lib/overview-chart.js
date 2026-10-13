// Pure helpers for the Overview chart and its "By campaign" table (no React; see test/overview-chart.test.mjs).

import { deltaText, shortFormat } from "./advertiser-overview.js";
import { formatOf } from "./formats.js";

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
  const booked = new Set();
  for (const campaign of campaigns) {
    impressions += campaign.impressions;
    previous += campaign.previousDaily.reduce((sum, value) => sum + value, 0);
    if (campaign.avgVisible != null && campaign.impressions > 0) {
      weighted += campaign.avgVisible * campaign.impressions;
      weight += campaign.impressions;
    }
    for (const id of campaign.reachedIds ?? campaign.gameIds) games.add(id);
    for (const id of campaign.gameIds) booked.add(id);
  }
  return {
    impressions,
    delta: deltaText(impressions, previous),
    avgVisible: weight > 0 ? weighted / weight : null,
    visibleHours: weight > 0 ? weighted / 3600 : null,
    games: games.size,
    gamesBooked: booked.size,
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-10" -> "Sat 10 Oct" (fixed English names: the same on the server and in the browser). */
export function weekdayDay(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1] ?? ""}`.trim();
}

/** Sum of a list of numbers. */
export const sumOf = (values) => values.reduce((sum, value) => sum + value, 0);

/**
 * One campaign's impressions per day, split by creative, game and format.
 *   rows:      advertiser_daily_split rows { day, creative_id, placement_id, impressions }
 *   dates:     the days of the period, oldest first
 *   creatives: Map(id -> name)
 *   places:    Map(placement id -> { gameId, game, aspect })
 * Each dimension is a list of { key, name, daily } (daily has one number per date).
 */
export function buildSplits({ rows = [], dates, creatives = new Map(), places = new Map() }) {
  const index = new Map(dates.map((date, position) => [date, position]));
  const dims = { creative: new Map(), game: new Map(), format: new Map() };
  const add = (dim, key, name, position, count) => {
    if (!dims[dim].has(key)) dims[dim].set(key, { key, name, daily: Array.from({ length: dates.length }, () => 0) });
    dims[dim].get(key).daily[position] += count;
  };
  for (const row of rows) {
    const position = index.get(String(row.day).slice(0, 10));
    if (position == null) continue;
    const count = Number(row.impressions) || 0;
    const place = places.get(row.placement_id);
    add("creative", row.creative_id, creatives.get(row.creative_id) ?? "Creative", position, count);
    add("game", place?.gameId ?? "unknown", place?.game ?? "A game", position, count);
    const format = formatOf(Number(place?.aspect));
    add("format", format ?? "other", format ? shortFormat(format) : "Other shapes", position, count);
  }
  return Object.fromEntries(Object.entries(dims).map(([dim, map]) => [dim, [...map.values()]]));
}

/** Adds the same-keyed series of several campaigns, busiest first; everything past `limit` folds into "Other". */
export function mergeSplit(splits, dim, length, limit = 6) {
  const merged = new Map();
  for (const split of splits) {
    for (const item of split?.[dim] ?? []) {
      if (!merged.has(item.key)) merged.set(item.key, { key: item.key, name: item.name, daily: Array.from({ length }, () => 0) });
      const target = merged.get(item.key);
      for (let i = 0; i < length; i += 1) target.daily[i] += item.daily[i] ?? 0;
    }
  }
  const list = [...merged.values()].sort((a, b) => sumOf(b.daily) - sumOf(a.daily) || a.name.localeCompare(b.name));
  if (list.length <= limit) return list;
  const head = list.slice(0, limit - 1);
  const rest = list.slice(limit - 1);
  return [...head, { key: "other", name: `${rest.length} others`, daily: sumSeries(rest.map((item) => item.daily), length) }];
}

/** Stroke patterns, so a line is told apart by more than its colour. */
export const DASHES = [undefined, "7 4", "2 4", "10 3 2 3", "1 5", "14 4"];
export const dashOf = (index) => DASHES[index % DASHES.length];

/**
 * Where the names at the line ends go (px from the top of the plot): each at its line's last value,
 * pushed apart so that no two overlap. `values` are pixel heights; the result keeps their order.
 */
export function spreadLabels(values, gap = 16, max = 240) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  let last = -Infinity;
  const placed = order.map((item) => {
    const top = Math.max(item.value, last + gap);
    last = top;
    return { index: item.index, top };
  });
  // If pushing ran past the bottom, pull the lot back up.
  const overflow = Math.max(0, last - max);
  const result = [];
  for (const item of placed) result[item.index] = Math.max(0, item.top - overflow);
  return result;
}

/**
 * Events to mark on the chart, from the campaigns' rows. Each: { date, kind, label, campaignId }.
 * Kept to the dates of the period; same-day events stay separate so the chart can stack their names.
 */
export function chartEvents({ campaigns = [], dates = [] }) {
  const within = new Set(dates);
  const out = [];
  for (const campaign of campaigns) {
    for (const event of campaign.events ?? []) {
      if (within.has(event.date)) out.push({ ...event, campaignId: campaign.id });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
