// The figures and words on a campaign's card and strip. Run: node test/campaign-cards.test.mjs
import assert from "node:assert/strict";
import { TONE_VAR, compactCount, dateBar, dayDiff, dayText, plural, sortCampaigns, sparkShape, stripBar, subLine } from "../lib/campaign-cards.js";
import { STATUS_GROUPS, campaignGroup } from "../lib/campaign-list.js";

const TODAY = "2026-10-19"; // the day the mockup was drawn on
const camp = (status, starts, ends, extra = {}) => ({ name: "A", status: { key: status, label: status[0].toUpperCase() + status.slice(1) }, starts, ends, impressions: 0, ...extra });

// days and dates
assert.equal(dayDiff("2026-10-19", "2026-10-05"), 14);
assert.equal(dayDiff("2026-11-01", "2026-10-31"), 1);
assert.equal(dayText("2026-10-05"), "5 Oct");
assert.equal(dayText(""), "");

// impressions as the card prints them
assert.equal(compactCount(0), "0");
assert.equal(compactCount(999), "999");
assert.equal(compactCount(22900), "22.9K");
assert.equal(compactCount(96400), "96.4K");
assert.equal(compactCount(184200), "184K");
assert.equal(compactCount(1250000), "1.3M");
assert.equal(compactCount(undefined), "0");

// every status has a colour; the colours group like the filter does
for (const [key] of Object.entries({ live: 1, limited: 1, paused: 1, stopped: 1, scheduled: 1, waiting: 1, draft: 1, ended: 1 })) assert.ok(TONE_VAR[key], `${key} has a tone`);
assert.deepEqual(STATUS_GROUPS.map(([key]) => key), ["all", "live", "paused", "upcoming", "draft", "ended"]);
assert.equal(campaignGroup(camp("limited")), "live");
assert.equal(campaignGroup(camp("waiting")), "upcoming");

// the date bar: the same words as the mockup
const running = dateBar(camp("live", "2026-10-05", "2026-11-15"), TODAY);
assert.deepEqual(running.top, ["5 Oct", "15 Nov"]);
assert.equal(running.note, "Day 15 of 42 · 27 days left");
assert.equal(running.cls, "is-running");
assert.ok(Math.abs(running.pct - (15 / 42) * 100) < 1e-9);
const openEnd = dateBar(camp("live", "2026-09-28", ""), TODAY);
assert.deepEqual(openEnd.top, ["28 Sep", "No end"]);
assert.equal(openEnd.note, "Day 22 · no end date");
assert.equal(openEnd.cls, "is-running is-open");
assert.equal(openEnd.pct, 72);
const paused = dateBar(camp("paused", "2026-10-01", "2026-10-31"), TODAY);
assert.equal(paused.note, "Paused · Day 19 of 31 · 12 days left");
assert.equal(paused.cls, "");
const future = dateBar(camp("scheduled", "2026-11-20", "2026-11-30"), TODAY);
assert.equal(future.note, "Starts in 32 days");
assert.equal(future.cls, "is-future");
assert.equal(future.pct, 0);
const over = dateBar(camp("ended", "2026-08-01", "2026-09-15"), TODAY);
assert.equal(over.note, "Ended 34 days ago");
assert.equal(over.cls, "is-over");
assert.equal(over.pct, 100);
const none = dateBar(camp("draft", "", ""), TODAY);
assert.equal(none.top, null);
assert.equal(none.cls, "is-none");
assert.equal(none.note, "Dates are set with the placements");
assert.equal(dateBar(camp("live", "2026-10-19", "2026-10-19"), TODAY).note, "Day 1 of 1 · ends today");
assert.ok(!dateBar(camp("stopped", "2026-10-05", "2026-11-15"), TODAY).cls.includes("is-running"), "a stopped campaign does not run");
// launched but waiting for the creative to be approved: no start date yet
const waiting = dateBar(camp("waiting", "", "2026-12-01", { launched: true }), TODAY);
assert.deepEqual(waiting.top, ["On approval", "1 Dec"]);
assert.equal(waiting.note, "Starts when the creative is approved · ends in 43 days");

// the strip's shorter bar
const strip = stripBar(camp("live", "2026-10-05", "2026-11-15"), TODAY);
assert.equal(strip.line, "5 Oct → 15 Nov");
assert.equal(strip.note, "Day 15 of 42");
assert.equal(stripBar(camp("live", "2026-09-28", ""), TODAY).note, "Day 22");
assert.equal(stripBar(camp("scheduled", "2026-11-20", "2026-11-30"), TODAY).note, "Starts in 32 days");
assert.equal(stripBar(camp("ended", "2026-08-01", "2026-09-15"), TODAY).note, "Ended 34 days ago");
const unscheduled = stripBar(camp("draft", "", ""), TODAY);
assert.equal(unscheduled.line, "Not scheduled");
assert.equal(unscheduled.note, "Set with placements");

// the line under the name
assert.deepEqual(subLine(camp("live", "2026-10-05", "2026-11-15"), TODAY), { label: "Live", text: " · day 15 of 42" });
assert.deepEqual(subLine(camp("live", "2026-09-28", ""), TODAY), { label: "Live", text: " · day 22" });
assert.deepEqual(subLine(camp("scheduled", "2026-11-20", "2026-11-30"), TODAY), { label: "Scheduled", text: " · starts in 32 days" });
assert.deepEqual(subLine(camp("ended", "2026-08-01", "2026-09-15"), TODAY), { label: "Ended", text: "" });
assert.deepEqual(subLine(camp("draft", "", ""), TODAY), { label: "Draft", text: "" });

// the little chart
assert.equal(sparkShape([]), null);
assert.equal(sparkShape([0, 0, 0]), null);
assert.equal(sparkShape([5]), null);
const shape = sparkShape([0, 5, 10]);
assert.equal(shape.line, "M1.0 31.0L55.0 17.5L109.0 4.0");
assert.equal(shape.area, "M1.0 31.0L55.0 17.5L109.0 4.0L109 33L1 33Z");
assert.deepEqual(shape.end, [109, 4]);

// the order of the list
const list = [
  camp("ended", "2026-08-01", "2026-09-15", { name: "Zed", impressions: 73100 }),
  camp("live", "2026-10-05", "2026-11-15", { name: "Beta", impressions: 184200 }),
  camp("draft", "", "", { name: "Alpha", impressions: 0 }),
  camp("paused", "2026-10-01", "2026-10-31", { name: "Gamma", impressions: 41200 }),
  camp("live", "2026-09-28", "", { name: "Delta", impressions: 96400 }),
  camp("scheduled", "2026-11-20", "2026-11-30", { name: "Eps", impressions: 0 }),
];
const names = (campaigns) => campaigns.map((c) => c.name).join();
assert.equal(names(sortCampaigns(list)), "Beta,Delta,Gamma,Eps,Alpha,Zed", "by status, the busiest first inside a status");
assert.equal(names(sortCampaigns(list, "impressions", "desc")), "Beta,Delta,Zed,Gamma,Eps,Alpha");
assert.equal(names(sortCampaigns(list, "name")), "Alpha,Beta,Delta,Eps,Gamma,Zed");
assert.equal(names(sortCampaigns(list, "dates")), "Zed,Delta,Gamma,Beta,Eps,Alpha", "campaigns without dates go last");
assert.equal(list[0].name, "Zed", "the list is not changed");

assert.equal(plural(1, "game", "games"), "1 game");
assert.equal(plural(12, "game", "games"), "12 games");
assert.equal(plural(0, "placement", "placements"), "0 placements");

console.log("campaign-cards ok");
