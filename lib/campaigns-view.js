// What the Campaigns tab works out from the figures it is given: totals for a period, averages and
// the stacked chart. Pure (no React, no database) so it can be tested; campaigns-data.js reads the figures.

export const STATS_DAYS = 90;
export const PERIODS = [7, 30, 90];
export const PALETTE = ["#c94a24", "#3b6fb6", "#2f9e8f", "#d9a441", "#8a63b8", "#c2527a"];
export const GREY = "#aab0bd";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" -> "12 Oct" */
export function dayLabel(iso) {
  const [, month, day] = String(iso).split("-");
  return `${Number(day)} ${MON[Number(month) - 1] ?? ""}`;
}

export const number = (n) => Math.round(n).toLocaleString("en-US");

/** Views, visible seconds and the count they average over for the last `period` days. */
export function totalsFor(figures, period) {
  const out = { views: 0, sum: 0, n: 0 };
  if (!figures) return out;
  for (let i = STATS_DAYS - period; i < STATS_DAYS; i++) {
    out.views += figures.v[i] ?? 0;
    out.sum += figures.s[i] ?? 0;
    out.n += figures.n[i] ?? 0;
  }
  return out;
}

/** Sum several totals. */
export function addTotals(list) {
  return list.reduce((all, one) => ({ views: all.views + one.views, sum: all.sum + one.sum, n: all.n + one.n }), { views: 0, sum: 0, n: 0 });
}

/** "6.8 s", or a dash when nothing was measured. */
export function averageText(totals) {
  return totals.n > 0 ? `${(totals.sum / totals.n).toFixed(1)} s` : "—";
}

/** The size of an image of this shape that fits in a box. */
export function fit(aspect, maxWidth, maxHeight) {
  const a = Number(aspect) > 0 ? Number(aspect) : 1;
  let width = maxWidth;
  let height = width / a;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * a;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * The chart of a campaign: one stacked bar per day (or per three days over 90), or in "creative" mode a cluster
 * of bars per day, one for each creative. More than six creatives: the five with the most views get a colour,
 * the rest are grouped as "Other". `pick` is the set of group ids the reader chose to compare.
 * Returns { cols, yTop, yMid, legend, colorOf, many, anyPick }.
 */
export function buildChart(creatives, days, { period, mode, pick = {} }) {
  const bucket = period === 90 ? 3 : 1;
  const start = STATS_DAYS - period;
  const totals = creatives.map((creative) => totalsFor(creative.figures, period).views);
  const order = creatives.map((_, k) => k).sort((p, q) => totals[q] - totals[p] || p - q);
  const many = creatives.length > 6;
  const groupOf = [];
  if (many) order.forEach((k, rank) => (groupOf[k] = rank < 5 ? rank : 5));
  else creatives.forEach((_, k) => (groupOf[k] = k));
  const groupCount = many ? 6 : creatives.length;
  const colorOfGroup = (g) => (many && g === 5 ? GREY : PALETTE[g % PALETTE.length]);
  const idOfGroup = (g) => (many && g === 5 ? "others" : creatives[many ? order[g] : g].id);
  const nameOfGroup = (g) => (many && g === 5 ? `Other creatives (${creatives.length - 5})` : creatives[many ? order[g] : g].name);

  const rows = [];
  for (let from = start; from < STATS_DAYS; from += bucket) {
    const to = Math.min(from + bucket, STATS_DAYS);
    const row = new Array(groupCount).fill(0);
    creatives.forEach((creative, k) => {
      for (let i = from; i < to; i++) row[groupOf[k]] += creative.figures?.v[i] ?? 0;
    });
    rows.push({ row, from, to });
  }

  const anyPick = Object.values(pick).some(Boolean);
  const isOn = (g) => !anyPick || Boolean(pick[idOfGroup(g)]);
  const byCreative = mode === "creative";
  const shown = rows.map(({ row }) => (byCreative ? row.map((v, g) => (isOn(g) ? v : 0)) : [row.reduce((p, q) => p + q, 0)]));
  const sums = shown.map((row) => row.reduce((p, q) => p + q, 0));
  const max = (byCreative ? Math.max(0, ...shown.map((row) => Math.max(0, ...row))) : Math.max(0, ...sums)) || 1;

  const when = (from, to) => (to - from > 1 ? `${dayLabel(days[from])} – ${dayLabel(days[to - 1])}` : dayLabel(days[from]));
  const cols = shown.map((row, i) => {
    const label = when(rows[i].from, rows[i].to);
    const tip = `${label} · ${number(sums[i])} impressions`;
    if (byCreative) {
      return {
        cls: "cluster",
        tip,
        h: 100,
        segs: row.map((v, g) => ({ h: v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0, c: colorOfGroup(g), tip: `${label} · ${nameOfGroup(g)} · ${number(v)}` })),
      };
    }
    return { cls: "", tip, h: sums[i] > 0 ? Math.max(4, Math.round((sums[i] / max) * 100)) : 0, segs: [{ h: sums[i] > 0 ? 100 : 0, c: PALETTE[0], tip }] };
  });

  const legend = [];
  for (let g = 0; g < groupCount; g++) {
    legend.push({
      id: idOfGroup(g),
      name: nameOfGroup(g),
      color: colorOfGroup(g),
      total: number(rows.reduce((n, { row }) => n + row[g], 0)),
      on: isOn(g),
    });
  }
  const colorOf = new Map(creatives.map((creative, k) => [creative.id, colorOfGroup(groupOf[k])]));
  return { cols, yTop: number(max), yMid: number(max / 2), legend, colorOf, many, anyPick };
}
