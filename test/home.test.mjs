// The Home page rules and content. Run: node test/home.test.mjs
import assert from "node:assert/strict";
import { homeMode, developerChecklist, advertiserChecklist, advertiserStrips, developerStrips, activityWhen } from "../lib/home-rules.js";
import { ART, GUIDE_CARDS, GUIDE_LIST, NEWS, TIPS, guideBySlug, slugOf } from "../lib/home-content.js";

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

// a developer's strips: quiet games first, new campaigns near today
const now = Date.parse("2026-10-28T12:00:00Z");
const dev = developerStrips({
  now,
  games: [
    { id: "a", name: "Alpha", placements: 3, quietDays: 9 },
    { id: "b", name: "Beta", placements: 0, quietDays: null },
    { id: "c", name: "Gamma", placements: 4, quietDays: 2 },
  ],
  campaigns: [
    { id: "1", gameId: "c", game: "Gamma", advertiser: "Acme", campaign: "Sale", startsOn: "2026-10-28" },
    { id: "2", gameId: "c", game: "Gamma", advertiser: "Acme", campaign: "Old", startsOn: "2026-09-01" },
    { id: "3", gameId: "c", game: "Gamma", advertiser: "Acme", campaign: "Soon", startsOn: "2026-10-30" },
  ],
});
assert.deepEqual(dev.map((item) => item.key), ["quiet:a", "empty:b", "campaign:1", "campaign:3"]);
assert.match(dev[0].text, /No signal from the SDK for 9 days · its 3 placements are not updating/);
assert.match(dev[2].text, /started today/);
assert.match(dev[3].text, /starts in 2 days/);
assert.deepEqual(developerStrips({ games: [{ id: "d", name: "D", placements: 1, quietDays: 1 }], now }), []);

// when a notification happened
assert.equal(activityWhen("2026-10-28T09:40:00Z", now), "Today 09:40");
assert.equal(activityWhen("2026-10-27T20:00:00Z", now), "Yesterday");
assert.equal(activityWhen("2026-10-23T10:00:00Z", now), "5 days ago");
assert.equal(activityWhen("garbage", now), "");

// content: every guide on Home exists and has steps; slugs round-trip
for (const role of ["dev", "adv"]) {
  assert.equal(GUIDE_CARDS[role].length, 3);
  for (const [title] of GUIDE_CARDS[role]) {
    assert.ok(ART[title], `${title} has an article`);
    assert.ok(GUIDE_LIST[role].includes(title));
    assert.equal(guideBySlug(slugOf(title)).title, title);
    assert.ok(ART[title].steps.length > 0 && ART[title].note.length === 2);
  }
  assert.ok(TIPS[role].length >= 3 && TIPS[role].every((tip) => tip.length === 2));
  for (const item of NEWS[role]) assert.ok(item.body || item.items || item.s, `${item.id} has text`);
}
assert.equal(guideBySlug("nope"), null);
assert.equal(slugOf("Placements, scenes and folders"), "placements-scenes-and-folders");

console.log("home tests passed");
