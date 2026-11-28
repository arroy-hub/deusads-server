// The Home page rules and content. Run: node test/home.test.mjs
import assert from "node:assert/strict";
import { homeMode, developerChecklist, advertiserChecklist, advertiserStrips, developerStrips, activityWhen, groupActivity, advertiserWallet, developerWallet, walletActivity, mergeActivity } from "../lib/home-rules.js";
import { attentionItems } from "../lib/advertiser-overview.js";
import { budgetOf, budgetWatch } from "../lib/wallet.js";
import { ART, GUIDE_CARDS, GUIDE_LIST, LATEST, NEWS, TIPS, groupChanges, guideBySlug, slugOf } from "../lib/home-content.js";

// new or active
assert.equal(homeMode("developer", { games: 0 }), "new");
assert.equal(homeMode("developer", { games: 1 }), "active");
assert.equal(homeMode("advertiser", { creatives: 0, campaigns: 0 }), "new");
assert.equal(homeMode("advertiser", { creatives: 1 }), "active");
assert.equal(homeMode("advertiser", { campaigns: 1 }), "active");

// checklists: the first open step is the current one
const fresh = developerChecklist({});
assert.equal(fresh.length, 4);
assert.equal(fresh.findIndex((step) => step.current), 0);
const partway = developerChecklist({ games: 2, detailsFilled: 1, connected: 0, placements: 0 });
assert.deepEqual(partway.map((step) => step.done), [true, false, false, false]);
assert.equal(partway.filter((step) => step.current).length, 1);
assert.equal(partway.find((step) => step.current).key, "details");
assert.ok(developerChecklist({ games: 1, detailsFilled: 1, connected: 1, placements: 3 }).every((step) => step.done && !step.current));
assert.deepEqual(advertiserChecklist({ creatives: 1, campaigns: 1 }).map((step) => step.done), [true, true, false, false]);

// an advertiser's attention items become strips: tone and icon follow the item
const strips = advertiserStrips([
  { key: "rejected:1", tone: "bad", title: "A was rejected", text: "why", href: "/x", action: "Open creative" },
  { key: "ending:2", tone: "info", title: "B ends today", text: "", href: "/y", action: "Extend" },
]);
assert.equal(strips[0].tone, "stop");
assert.equal(strips[0].primary, true);
assert.equal(strips[0].icon, "image");
assert.equal(strips[1].tone, "sched");
assert.equal(strips[1].icon, "clock");
assert.equal(strips[1].primary, false);

// the wallet on Home: budgets that ran out or run low lead Needs attention, and the Wallet block names the one to act on
{
  const campaign = (id, name, status, budget, spent, closed = false) => ({ id, name, status, budget: budgetOf({ budget, budget_spent: spent, budget_closed_at: closed ? "2026-11-03T00:00:00Z" : null }) });
  const campaigns = [
    campaign("c1", "Summer Citrus", "live", 900, 406.26),
    campaign("c2", "Zero Sugar", "live", 150, 131.2),
    campaign("c3", "Spring Refresh", "ended", 200, 82.37, true),
    campaign("c5", "Winter Mango", "budget", 100, 99.999),
    campaign("c6", "Paused one", "paused", 100, 95),
    campaign("c4", "Always-on", "live", null, 316.03),
  ];
  const watch = budgetWatch(campaigns);
  assert.deepEqual([watch.total, watch.running], [4, 3], "ended and no-limit campaigns are not counted");
  assert.deepEqual(watch.out.map((c) => c.id), ["c5"]);
  assert.deepEqual(watch.low.map((c) => c.id), ["c2"], "a paused campaign is not spending: no warning");
  assert.ok(Math.abs(watch.reserved - (493.74 + 18.8 + 0.001 + 5)) < 1e-6);

  const items = attentionItems({
    budgets: [...watch.out.map((c) => ({ id: c.id, name: c.name, key: "out" })), ...watch.low.map((c) => ({ id: c.id, name: c.name, key: "low", pct: c.budget.pct, left: "18.80" }))],
    rejected: [{ id: "k1", name: "Mango can", note: "too small" }],
    limited: [{ id: "c1", name: "Summer Citrus", key: "limited", note: "paused in 1 game" }],
  });
  assert.deepEqual(items.map((item) => item.key), ["budget-out:c5", "rejected:k1", "budget-low:c2", "limited:c1"]);
  assert.equal(items[0].title, "Winter Mango is out of budget");
  assert.equal(items[2].title, "Zero Sugar has used 87% of its budget");
  assert.equal(items[2].text, "18.80 C. left. It stops by itself when they run out.");
  assert.equal(attentionItems({ rejected: [{ id: "k1", name: "Mango can" }] }).length, 1, "the bell asks without budgets and gets none");
  const budgetStrips = advertiserStrips(items);
  assert.deepEqual([budgetStrips[0].tone, budgetStrips[0].icon, budgetStrips[0].href], ["stop", "wallet", "/dashboard/advertising/c/c5"]);
  assert.deepEqual([budgetStrips[2].tone, budgetStrips[2].icon], ["warn", "wallet"]);

  const block = advertiserWallet({ available: 617.63, spentToday: 12.5 }, watch);
  assert.equal(block.available, 617.63);
  assert.deepEqual(block.rows, [["Reserved in campaigns", "517.54"], ["Spent today", "12.50"], ["Campaigns running on a budget", "3 of 4"]]);
  assert.deepEqual(block.flag, { tone: "stop", text: "Winter Mango is out of budget", href: "/dashboard/advertising/c/c5" });
  const lowOnly = advertiserWallet({ available: 1 }, budgetWatch(campaigns.filter((c) => c.id !== "c5")));
  assert.deepEqual(lowOnly.flag, { tone: "warn", text: "Zero Sugar: 18.80 C. left", href: "/dashboard/advertising/c/c2" });
  assert.equal(advertiserWallet({ available: 0 }, budgetWatch([])).flag, null);
  assert.equal(advertiserWallet({}, budgetWatch([campaign("a", "A", "budget", 1, 1), campaign("b", "B", "budget", 1, 1)])).flag.text, "2 campaigns are out of budget");

  const dev = developerWallet({ total: { impressions: 100000 }, today: { impressions: 2500 }, days: ["2026-11-22", "2026-11-23"], week: [5000, 2500], paying: 4 });
  assert.equal(dev.balance, 480);
  assert.equal(dev.today, 12);
  assert.deepEqual(dev.spark, [{ day: "2026-11-22", value: 24 }, { day: "2026-11-23", value: 12 }]);
  assert.deepEqual(dev.rows, [["Earned · 7 days", "36.00"], ["Paid impressions today", "2,500"], ["Campaigns paying in your games", "4"]]);

  const ops = walletActivity([
    { id: 3, kind: "topup", amount: 500, at: "2026-11-23T09:00:00Z" },
    { id: 2, kind: "reserve", amount: -150, campaignName: "Zero Sugar", at: "2026-11-12T10:00:00Z" },
    { id: 1, kind: "return", amount: 117.63, campaignName: "Spring Refresh", at: "2026-11-03T00:00:00Z" },
  ]);
  assert.deepEqual(ops.map((row) => [row.text, row.tone, row.icon]), [["500.00 C. added to your wallet", "live", "plus"], ["150.00 C. reserved for Zero Sugar", "sched", "wallet"], ["117.63 C. returned from Spring Refresh", "sched", "wallet"]]);
  const merged = mergeActivity([[{ id: "n1", at: "2026-11-20T08:00:00Z", text: "Creative approved", href: "/x", tone: "live", icon: "image" }], ops], { limit: 3, now: Date.parse("2026-11-23T12:00:00Z") });
  assert.deepEqual(merged.map((row) => [row.id, row.when]), [["op:3", "Today 09:00"], ["n1", "3 days ago"], ["op:2", "11 days ago"]]);
  assert.equal("at" in merged[0], false);
}

// a developer's strips: quiet games first, then what is new in a game's campaigns
const now = Date.parse("2026-10-28T12:00:00Z");
const dev = developerStrips({
  now,
  games: [
    { id: "a", name: "Alpha", placements: 3, quietDays: 9 },
    { id: "b", name: "Beta", placements: 0, quietDays: null },
    { id: "c", name: "Gamma", placements: 4, quietDays: 2 },
  ],
  fresh: [
    { gameId: "c", game: "Gamma", campaigns: 2, creatives: 1 },
    { gameId: "a", game: "Alpha", campaigns: 0, creatives: 2 },
    { gameId: "z", game: "Zeta", campaigns: 0, creatives: 0 },
  ],
});
assert.deepEqual(dev.map((item) => item.key), ["quiet:a", "empty:b", "new:c", "new:a"]);
assert.match(dev[0].text, /No signal from the SDK for 9 days · its 3 placements are not updating/);
assert.equal(dev[2].title, "2 new campaigns and 1 new creative in Gamma");
assert.equal(dev[2].href, "/dashboard/g/c?tab=campaigns");
assert.equal(dev[3].title, "2 new creatives in Alpha");
assert.match(dev[3].text, /already running/);
assert.deepEqual(developerStrips({ games: [{ id: "d", name: "D", placements: 1, quietDays: 1 }], now }), []);

// when a notification happened
assert.equal(activityWhen("2026-10-28T09:40:00Z", now), "Today 09:40");
assert.equal(activityWhen("2026-10-27T20:00:00Z", now), "Yesterday");
assert.equal(activityWhen("2026-10-23T10:00:00Z", now), "5 days ago");
assert.equal(activityWhen("garbage", now), "");

// content: every guide on Home exists and has steps; slugs round-trip
for (const role of ["dev", "adv"]) {
  assert.equal(GUIDE_CARDS[role].length, 4); // three guides and the platform rules of that side
  for (const [title] of GUIDE_CARDS[role]) {
    assert.ok(ART[title], `${title} has an article`);
    assert.ok(GUIDE_LIST[role].includes(title));
    assert.equal(guideBySlug(slugOf(title)).title, title);
    assert.ok(ART[title].steps.length > 0 && ART[title].note.length === 2);
  }
  assert.ok(TIPS[role].length >= 3 && TIPS[role].every((tip) => tip.length === 2));
  for (const item of NEWS[role]) assert.ok(item.body || item.items || item.s, `${item.id} has text`);
  // newest first, and Home's What's new shows exactly the top entry of All news
  const stamps = NEWS[role].map((item) => Date.parse(item.d));
  assert.ok(stamps.every((ms, i) => !Number.isNaN(ms) && (i === 0 || ms <= stamps[i - 1])), `${role} news is newest first`);
  assert.equal(LATEST[role].title, NEWS[role][0].t);
  assert.equal(LATEST[role].text, NEWS[role][0].s);
}
// patch notes: one block per label, New before Improved before Fixed, every change kept once
{
  const grouped = groupChanges([["Improved", "b", "x"], ["New", "a", "x"], ["Improved", "c", "x"], ["Fixed", "d", "x"], ["New", "e", "x"]]);
  assert.deepEqual(grouped.map(([tag]) => tag), ["New", "Improved", "Fixed"]);
  assert.deepEqual(grouped[0][1].map(([title]) => title), ["a", "e"]);
  assert.deepEqual(grouped[1][1].map(([title]) => title), ["b", "c"]);
  for (const role of ["dev", "adv"]) {
    for (const item of NEWS[role].filter((entry) => entry.items)) {
      const tags = groupChanges(item.items).map(([tag]) => tag);
      assert.equal(new Set(tags).size, tags.length, `${item.id} repeats a label`);
      assert.equal(groupChanges(item.items).reduce((sum, [, list]) => sum + list.length, 0), item.items.length);
    }
  }
}
assert.equal(guideBySlug("nope"), null);
assert.equal(slugOf("Placements, scenes and folders"), "placements-scenes-and-folders");

// Recent activity: a burst of the same kind is one row
{
  const AD = "A new ad is showing in your game. You can pause or block it in the game's Campaigns tab.";
  const SEVERAL = "New ads are showing in several of your games. Open a game's Campaigns tab to pause or block one.";
  const when = (minutes) => new Date(Date.parse("2026-10-28T12:00:00Z") - minutes * 60000).toISOString();
  const note = (id, text, link, minutes) => ({ id, text, link, created_at: when(minutes) });
  const ad = (id, game, campaign, minutes) => note(id, AD, `/dashboard/g/${game}?tab=campaigns&campaign=${campaign}`, minutes);

  const burst = groupActivity([ad("a3", "g1", "c3", 8), ad("a1", "g1", "c1", 1), ad("a2", "g1", "c2", 3)]);
  assert.equal(burst.length, 1);
  assert.deepEqual([burst[0].id, burst[0].count, burst[0].created_at], ["a1", 3, when(1)], "the newest row stands for the group");
  assert.equal(burst[0].text, "3 new ads are showing in your game");
  assert.equal(burst[0].link, "/dashboard/g/g1?tab=campaigns");

  const several = groupActivity([ad("a1", "g1", "c1", 1), ad("a2", "g2", "c2", 2), note("a3", SEVERAL, "/dashboard/games", 3)]);
  assert.equal(several[0].text, "3 new ads are showing in your games");
  assert.equal(several[0].link, "/dashboard/games", "several games: My games, where each one has its marker");

  // more than ten minutes between neighbours starts a new row; a chain of close ones stays together
  const split = groupActivity([ad("a1", "g1", "c1", 1), ad("a2", "g1", "c2", 5), ad("a3", "g1", "c3", 30)]);
  assert.deepEqual(split.map((item) => item.count), [2, 1]);
  assert.equal(split[1].text, AD, "a lone row is left as it is");
  assert.equal(split[1].link, "/dashboard/g/g1?tab=campaigns&campaign=c3");
  assert.equal(groupActivity([ad("a1", "g1", "c1", 0), ad("a2", "g1", "c2", 9), ad("a3", "g1", "c3", 18), ad("a4", "g1", "c4", 27)]).length, 1, "a long burst stays one row");

  // other kinds in between do not break a burst, and keep their own place
  const mixed = groupActivity([ad("a1", "g1", "c1", 1), note("p", "Your password was changed.", "/dashboard/account?tab=security", 2), ad("a2", "g1", "c2", 3)]);
  assert.deepEqual(mixed.map((item) => item.count), [2, 1]);
  assert.equal(mixed[1].text, "Your password was changed.");

  // stopped or withdrawn
  const stopped = groupActivity([note("s1", "The advertiser withdrew their booking on Pocket Harvest.", "/dashboard/games", 1), note("s2", "An advertiser stopped a campaign that was showing in your game.", "/dashboard/games", 2)]);
  assert.equal(stopped[0].text, "2 ads were withdrawn or stopped in your games");

  // any other text is merged only when it is exactly the same; different names stay apart
  const same = groupActivity([note("x1", "Your password was changed.", "/dashboard/account", 1), note("x2", "Your password was changed.", "/dashboard/account", 2)]);
  assert.equal(same[0].text, "Your password was changed. ×2");
  assert.equal(groupActivity([note("y1", 'Your creative "A" was approved.', null, 1), note("y2", 'Your creative "B" was approved.', null, 2)]).length, 2);
  assert.deepEqual(groupActivity([]), []);
}

console.log("home tests passed");
