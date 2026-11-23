// Totals and the chart of the Campaigns tab. Run: node test/campaigns-view.test.mjs
import assert from "node:assert/strict";
import { STATS_DAYS, addTotals, averageText, buildChart, dayLabel, earnedText, fit, totalsFor } from "../lib/campaigns-view.js";

const days = Array.from({ length: STATS_DAYS }, (_, i) => `2026-${i < 80 ? "08" : "09"}-${String((i % 28) + 1).padStart(2, "0")}`);
const figures = (views, secs = 0, n = 0) => {
  const f = { v: new Array(STATS_DAYS).fill(0), s: new Array(STATS_DAYS).fill(0), n: new Array(STATS_DAYS).fill(0) };
  f.v[STATS_DAYS - 1] = views; // today
  f.v[STATS_DAYS - 20] = views * 2; // 20 days ago
  f.s[STATS_DAYS - 1] = secs;
  f.n[STATS_DAYS - 1] = n;
  return f;
};

assert.equal(dayLabel("2026-10-05"), "5 Oct");
assert.deepEqual(totalsFor(null, 7), { views: 0, sum: 0, n: 0, paid: 0 });
assert.equal(totalsFor(figures(10), 7).views, 10);
assert.equal(totalsFor(figures(10), 30).views, 30);
assert.equal(totalsFor(figures(10), 90).views, 30);
assert.equal(averageText(totalsFor(figures(10, 60, 10), 7)), "6.0 s");
assert.equal(averageText({ views: 5, sum: 0, n: 0 }), "—");
assert.deepEqual(addTotals([{ views: 1, sum: 2, n: 3 }, { views: 4, sum: 5, n: 6 }]), { views: 5, sum: 7, n: 9, paid: 0 });
assert.deepEqual(addTotals([{ views: 1, sum: 2, n: 3, paid: 1 }, { views: 4, sum: 5, n: 6, paid: 3 }]), { views: 5, sum: 7, n: 9, paid: 4 });
assert.deepEqual(fit(2, 100, 100), { width: 100, height: 50 });
assert.deepEqual(fit(0.5, 100, 100), { width: 50, height: 100 });

const a = { id: "a", name: "A", figures: figures(10) };
const b = { id: "b", name: "B", figures: figures(30) };
const total = buildChart([a, b], days, { period: 7, mode: "all" });
assert.equal(total.cols.length, 7);
assert.equal(total.cols.at(-1).h, 100);
assert.equal(total.yTop, "40");
assert.equal(total.legend.length, 2);

const per = buildChart([a, b], days, { period: 30, mode: "creative" });
assert.equal(per.cols.length, 30);
assert.equal(per.cols.at(-1).segs.length, 2);
assert.equal(per.cols.at(-1).segs[1].h, 50);
// comparing one creative hides the other
const picked = buildChart([a, b], days, { period: 30, mode: "creative", pick: { a: true } });
assert.equal(picked.cols.at(-1).segs[1].h, 0);
assert.equal(picked.anyPick, true);

// 90 days are grouped in threes
assert.equal(buildChart([a], days, { period: 90, mode: "all" }).cols.length, 30);

// more than six creatives: five coloured, the rest in one grey group
const eight = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, figures: figures(i + 1) }));
const grouped = buildChart(eight, days, { period: 7, mode: "creative" });
assert.equal(grouped.many, true);
assert.equal(grouped.legend.length, 6);
assert.match(grouped.legend[5].name, /Other creatives \(3\)/);

// with the wallet: what was paid is added up, and the chart says what a bar earned and marks today
const paidFigures = (views, paid) => ({ ...figures(views), p: Object.assign(new Array(STATS_DAYS).fill(0), { [STATS_DAYS - 1]: paid, [STATS_DAYS - 20]: paid * 2 }) });
assert.equal(totalsFor(paidFigures(10, 8), 7).paid, 8);
assert.equal(totalsFor(paidFigures(10, 8), 30).paid, 24);
assert.equal(totalsFor(figures(10), 30).paid, 0, "figures from before the wallet have nothing paid");
assert.equal(earnedText(1000), "4.80 C.");
const pa = { id: "a", name: "A", figures: paidFigures(1000, 1000) };
const pb = { id: "b", name: "B", figures: paidFigures(500, 250) };
const plain = buildChart([pa, pb], days, { period: 7, mode: "all" });
assert.equal(plain.cols.at(-1).today, false);
assert.doesNotMatch(plain.cols.at(-1).tip, /earned/, "without the wallet the chart reads as before");
const earning = buildChart([pa, pb], days, { period: 7, mode: "all", earn: true });
assert.equal(earning.cols.at(-1).today, true);
assert.equal(earning.cols.at(-2).today, false);
assert.match(earning.cols.at(-1).tip, /today so far · 1,500 impressions · 6\.00 C\. earned$/);
const earningBy = buildChart([pa, pb], days, { period: 7, mode: "creative", earn: true, pick: { b: true } });
assert.match(earningBy.cols.at(-1).tip, /500 impressions · 1\.20 C\. earned$/, "only the creatives being compared count");
assert.match(earningBy.cols.at(-1).segs[1].tip, /B · 500 · 1\.20 C\.$/);
assert.match(buildChart([pa], days, { period: 90, mode: "all", earn: true }).cols.at(-1).tip, /includes today so far/);

console.log("campaigns-view tests passed");
