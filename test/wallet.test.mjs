// The wallet's rules (lib/wallet.js). Run: node test/wallet.test.mjs
import assert from "node:assert/strict";
import {
  DEV_SHARE, PRICE, RATE, budgetOf, budgetTone, costOf, count, credits, daySeries, dayText, developerPart, earnedOf, hasBudget, impressionsFor,
  lastDays, lastsAbout, mergePaid, missedImpressions, moneyTop, paidByDay, paidCampaigns, paidIndex, paidOf, parseAmount, platformPart, potentialOf, tickText, walletError, walletMissing, weekdayText,
} from "../lib/wallet.js";
import { budgetNoticeText, earnedText } from "../lib/wallet-notices.js";
import { campaignStatus } from "../lib/advertiser-overview.js";
import { campaignMayServe } from "../lib/campaign-rules.js";
import { campaignState, controlMap } from "../lib/game-controls.js";
import { outsideStatus } from "../lib/wallet-data.js";

const near = (a, b, text) => assert.ok(Math.abs(a - b) < 1e-9, text ?? `${a} != ${b}`);

// the price: 6 credits per 1,000 impressions, 80% to the developer, 20% to the platform
assert.equal(RATE, 6);
near(PRICE, 0.006);
near(costOf(1000), 6);
near(earnedOf(1000), 4.8);
near(earnedOf(62160), 298.368);
near(developerPart(6), 4.8);
near(platformPart(6), 1.2);
// the books balance to the cent whatever the amount
for (const amount of [0.006, 1853.574, 0.01, 123.456, 99999.999]) {
  near(Number((Math.round(developerPart(amount) * 100) / 100 + platformPart(amount)).toFixed(2)), Number((Math.round(amount * 100) / 100).toFixed(2)), `books for ${amount}`);
}
assert.equal(DEV_SHARE, 0.8);
assert.equal(impressionsFor(1), 166);
assert.equal(impressionsFor(300), 50000);
assert.equal(impressionsFor(0.005), 0);

// how figures are written
assert.equal(credits(1234.5), "1,234.50");
assert.equal(credits(0), "0.00");
assert.equal(credits(298.368), "298.37");
assert.equal(credits(null), "0.00");
assert.equal(count(62160.4), "62,160");
assert.equal(dayText("2026-11-23"), "23 Nov");
assert.equal(weekdayText("2026-11-23"), "Mon, 23 Nov");
assert.equal(tickText(40), "40");
assert.equal(tickText(2.5), "2.5");
assert.equal(tickText(1500), "1,500");
assert.equal(moneyTop(0), 1);
assert.equal(moneyTop(26.56), 40);
assert.equal(moneyTop(4), 4);
assert.equal(moneyTop(0.3), 0.4);

// an amount typed by a person
assert.equal(parseAmount("100"), 100);
assert.equal(parseAmount(" 1 000,50 "), 1000.5);
assert.equal(parseAmount("12.345"), 12.35);
assert.ok(Number.isNaN(parseAmount("abc")));
assert.ok(Number.isNaN(parseAmount("")));

// a campaign's budget
const unlimited = budgetOf({ budget: null, budget_spent: "12.5" });
assert.deepEqual([unlimited.unlimited, unlimited.spent, unlimited.left, unlimited.out], [true, 12.5, null, false]);
assert.ok(hasBudget({ budget: null }), "no limit: always shown");
assert.ok(hasBudget({}), "a row from before the migration has no limit");
const running = budgetOf({ budget: "150.00", budget_spent: "131.2000" });
near(running.left, 18.8);
near(running.pct, 87.4666666667);
assert.deepEqual([running.out, running.closed], [false, false]);
assert.equal(budgetTone(running), "#c94a24");
assert.equal(budgetTone(budgetOf({ budget: 100, budget_spent: 10 })), "#2e7d4f");
const out = budgetOf({ budget: "1.00", budget_spent: "0.9960" });
assert.ok(out.out, "cannot pay for one more impression");
assert.equal(budgetTone(out), "#b7791f");
assert.ok(!hasBudget({ budget: "1.00", budget_spent: "0.9960" }));
assert.ok(hasBudget({ budget: "1.00", budget_spent: "0.9940" }), "one impression still fits");
const closed = budgetOf({ budget: "200.00", budget_spent: "82.3700", budget_closed_at: "2026-11-03T00:00:00Z", budget_returned: "117.6300" });
assert.deepEqual([closed.closed, closed.left, closed.out, closed.returned], [true, 0, false, 117.63]);
assert.ok(!hasBudget({ budget: 200, budget_spent: 82.37, budget_closed_at: "2026-11-03T00:00:00Z" }), "what was left went back: not shown");
assert.equal(lastsAbout(18.8, 62.3), "2 days");
assert.equal(lastsAbout(0.5, 62.3), "less than a day");
assert.equal(lastsAbout(8.9, 62.3), "1 day");
assert.equal(lastsAbout(10, 0), null);

// days
assert.deepEqual(lastDays(3, Date.parse("2026-11-23T15:00:00Z")), ["2026-11-21", "2026-11-22", "2026-11-23"]);
const series = daySeries(["2026-11-21", "2026-11-22", "2026-11-23"], [{ day: "2026-11-22", impressions: 1000 }, { day: "2026-11-22T00:00:00", impressions: "500" }], DEV_SHARE);
assert.deepEqual(series.map((d) => d.impressions), [0, 1500, 0]);
near(series[1].value, 7.2);

// paid impressions cut like the Performance tab cuts views
const index = paidIndex([
  { day: "2026-11-22", placement_id: "p1", place_id: null, impressions: 10 },
  { day: "2026-11-23", placement_id: "p1", place_id: "s1", impressions: 4 },
  { day: "2026-11-23", placement_id: "p1", place_id: "s2", impressions: 6 },
  { day: "2026-11-23", placement_id: "p2", place_id: null, impressions: "5" },
]);
assert.equal(paidOf({ all: true }, index), 25);
assert.equal(paidOf({ members: [{ placement: "p1" }] }, index), 20);
assert.equal(paidOf({ members: [{ placement: "p1", place: "s1" }, { placement: "p2" }] }, index), 9);
assert.equal(paidOf({ members: [{ placement: "p1", unplaced: true }] }, index), 10);
assert.equal(paidOf({ members: [{ placement: "nope" }] }, index), 0);
assert.equal(paidOf({ members: [] }, index), 0);
assert.equal(paidOf(null, index), 0);
assert.deepEqual(paidByDay({ all: true }, index, ["2026-11-21", "2026-11-22", "2026-11-23"]), [0, 10, 15]);
assert.deepEqual(paidByDay({ members: [{ placement: "p1", place: "s2" }] }, index, ["2026-11-22", "2026-11-23"]), [0, 6]);

// what a selection could have earned
const pot = potentialOf({ paid: 62160, adv: 62160, own: 18300, filled: 89, empty: 11 });
near(pot.earned, 298.368);
near(pot.own, 87.84);
assert.equal(pot.emptyImpressions, 9944);
near(pot.other, 0);
near(pot.full, pot.earned + pot.own + pot.empty);
assert.equal(Math.round(pot.share), 69);
const withOther = potentialOf({ paid: 900, adv: 1000, own: 0, filled: 0, empty: 0 });
assert.equal(withOther.otherImpressions, 100);
near(withOther.full, earnedOf(1000));
assert.equal(potentialOf({}).share, 0);
assert.equal(missedImpressions({ adv: 62160, own: 18300, filled: 89, empty: 11 }), 9944);
assert.equal(potentialOf({ paid: 10, adv: 10, own: 0, missed: 250.4 }).emptyImpressions, 250, "a count worked out elsewhere (several games) is taken as it is");

// paid impressions per campaign, cut like the views
const campaignRows = [
  { id: "c1", name: "Alpha", advertiser: "A", placement_id: "p1", place_id: null, impressions: 10 },
  { id: "c1", name: "Alpha", advertiser: "A", placement_id: "p1", place_id: "s1", impressions: 4 },
  { id: "c2", name: "Beta", advertiser: "B", placement_id: "p2", place_id: null, impressions: 30 },
  { id: "c3", name: "Gamma", advertiser: "B", placement_id: "p3", place_id: null, impressions: 0 },
];
assert.deepEqual(paidCampaigns({ all: true }, campaignRows).map((row) => [row.id, row.impressions]), [["c2", 30], ["c1", 14]]);
assert.deepEqual(paidCampaigns({ members: [{ placement: "p1" }] }, campaignRows).map((row) => [row.id, row.impressions]), [["c1", 14]]);
assert.deepEqual(paidCampaigns({ members: [{ placement: "p1", place: "s1" }] }, campaignRows).map((row) => row.impressions), [4]);
assert.deepEqual(paidCampaigns({ members: [{ placement: "p1", unplaced: true }] }, campaignRows).map((row) => row.impressions), [10]);
assert.deepEqual(paidCampaigns(null, campaignRows), []);
assert.deepEqual(mergePaid([[{ label: "Menu", impressions: 5 }], [{ label: "Menu", impressions: 7 }, { label: "Shop", impressions: 0 }]]), [{ label: "Menu", impressions: 12 }]);

// messages
assert.equal(walletError({ error: "funds", available: 12 }), "Your wallet has 12.00 C. Add credits first or type a smaller amount.");
assert.equal(walletError({ error: "amount" }), "Type an amount above zero.");
assert.equal(walletError({ ok: true }), "");
assert.ok(walletMissing({ code: "PGRST202" }) && walletMissing({ code: "42703" }) && !walletMissing({ code: "23505" }) && !walletMissing(null));
assert.equal(budgetNoticeText({ kind: "out", name: "Zero Sugar Teaser" }), '"Zero Sugar Teaser" stopped: out of budget. Add budget to restart it.');
assert.equal(budgetNoticeText({ kind: "low", name: "Zero Sugar Teaser", budget: "150", spent: "135.6" }), '"Zero Sugar Teaser" has used 90% of its budget.');
assert.equal(earnedText(24.5, "yesterday"), "+24.50 C. earned yesterday");

// the rules that read the budget
const liveBooking = [{ status: "approved", label: "Live" }];
assert.equal(campaignStatus(liveBooking, { outOfBudget: true }).key, "budget");
assert.equal(campaignStatus(liveBooking, { outOfBudget: true }).label, "Out of budget");
assert.equal(campaignStatus(liveBooking, { outOfBudget: true, paused: true }).key, "paused", "a pause says more");
assert.equal(campaignStatus(liveBooking, { outOfBudget: true, stopped: true }).key, "ended");
assert.equal(campaignStatus([{ status: "ended" }], { outOfBudget: true }).key, "ended", "an ended campaign is ended, not out of budget");
assert.equal(campaignStatus([], { outOfBudget: false }).key, "draft");
assert.equal(campaignMayServe({ pausedAt: null, targeting: null, excluded: new Set(), outOfBudget: true }, "g", null), false);
assert.equal(campaignMayServe({ pausedAt: null, targeting: null, excluded: new Set(), outOfBudget: false }, "g", null), true);
const ctx = { controls: controlMap([{ scope: "campaign", target_id: "c2", state: "paused" }]), blocked: new Set() };
assert.equal(campaignState({ campaignId: "c1", advertiserId: "a", category: "retail", base: "active", outOfBudget: true }, ctx).key, "nobudget");
assert.equal(campaignState({ campaignId: "c2", advertiserId: "a", category: "retail", base: "active", outOfBudget: true }, ctx).key, "paused", "the developer's own pause comes first");
assert.equal(campaignState({ campaignId: "c1", advertiserId: "a", category: "retail", base: "ended", outOfBudget: true }, ctx).key, "ended");
const card = (extra = {}) => ({ deleted: false, stopped: false, paused: false, budget: budgetOf({ budget: 10, budget_spent: 1 }), ...extra });
assert.equal(outsideStatus(card(), true).label, "Active");
assert.equal(outsideStatus(card(), false).label, "Ended");
assert.equal(outsideStatus(card({ budget: budgetOf({ budget: 1, budget_spent: 0.996 }) }), true).label, "Out of budget");
assert.equal(outsideStatus(card({ paused: true }), true).label, "Paused");
assert.equal(outsideStatus(card({ deleted: true }), true).label, "Deleted");

console.log("wallet: all checks passed");

// payouts: the 1st of the month, from 50 credits
{
  const { payoutPlan, PAYOUT_MINIMUM } = await import("../lib/wallet.js");
  const { default: assert } = await import("node:assert/strict");
  assert.equal(PAYOUT_MINIMUM, 50);
  const mid = Date.parse("2026-11-28T16:00:00Z");
  assert.deepEqual(payoutPlan(12.5, mid), { minimum: 50, reached: false, left: 37.5, pct: 25, next: "2026-12-01" });
  assert.deepEqual(payoutPlan(822.04, mid), { minimum: 50, reached: true, left: 0, pct: 100, next: "2026-12-01" });
  assert.equal(payoutPlan(50, mid).reached, true);
  assert.equal(payoutPlan(60, Date.parse("2026-12-01T09:00:00Z")).next, "2026-12-01", "on the day itself it is today");
  assert.equal(payoutPlan(60, Date.parse("2026-12-31T23:00:00Z")).next, "2027-01-01");
  assert.equal(payoutPlan(-3, mid).pct, 0);
  console.log("payout plan: ok");
}
