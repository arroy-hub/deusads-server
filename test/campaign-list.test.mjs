import assert from "node:assert/strict";
import { campaignGroup, categoryRank, filterCampaigns, sortByCategory } from "../lib/campaign-list.js";

// The list order of the categories, not the alphabet: games_apps comes before auto although "Automotive" < "Games and apps".
assert.ok(categoryRank("games_apps") < categoryRank("auto"));
assert.ok(categoryRank("food_drink") < categoryRank("tech"));
assert.equal(categoryRank("unknown_id"), categoryRank("other"));
assert.equal(categoryRank(""), Number.POSITIVE_INFINITY);
assert.equal(categoryRank(undefined), Number.POSITIVE_INFINITY);

const rows = [
  { name: "Zed", category: "auto" },
  { name: "Beta", category: "games_apps" },
  { name: "No category", category: "" },
  { name: "Alpha", category: "games_apps" },
  { name: "Cola", category: "food_drink" },
];
assert.deepEqual(sortByCategory(rows).map((r) => r.name), ["Alpha", "Beta", "Cola", "Zed", "No category"]);
// Reversed: the category list backwards, names backwards inside a category, no category still last.
assert.deepEqual(sortByCategory(rows, "desc").map((r) => r.name), ["Zed", "Cola", "Beta", "Alpha", "No category"]);
// The input is not changed.
assert.equal(rows[0].name, "Zed");

// The status filter: every status of a campaign falls in exactly one group, and a name search narrows further.
const status = (key) => ({ name: key, status: { key } });
assert.equal(campaignGroup(status("live")), "live");
assert.equal(campaignGroup(status("limited")), "live");
assert.equal(campaignGroup(status("stopped")), "live");
assert.equal(campaignGroup(status("paused")), "paused");
assert.equal(campaignGroup(status("scheduled")), "upcoming");
assert.equal(campaignGroup(status("waiting")), "upcoming");
assert.equal(campaignGroup(status("draft")), "draft");
assert.equal(campaignGroup(status("ended")), "ended");
assert.equal(campaignGroup({}), "draft");
const all = ["live", "limited", "paused", "scheduled", "draft", "ended"].map(status);
assert.equal(filterCampaigns(all).length, 6);
assert.deepEqual(filterCampaigns(all, { group: "live" }).map((c) => c.name), ["live", "limited"]);
assert.deepEqual(filterCampaigns(all, { query: "  END " }).map((c) => c.name), ["ended"]);
assert.deepEqual(filterCampaigns(all, { query: "e", group: "upcoming" }).map((c) => c.name), ["scheduled"]);
console.log("campaign-list tests passed");
