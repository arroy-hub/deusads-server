// Menus per role and the Home steps. Run: node test/nav.test.mjs
import assert from "node:assert/strict";
import { menuFor, homeFor, isActive } from "../lib/nav.js";
import { developerSteps, advertiserPipeline } from "../lib/home-rules.js";

const labels = (role) => menuFor(role).flatMap((group) => group.items.map((item) => item.label));

assert.deepEqual(labels("developer"), ["Home", "My games", "Ad requests", "Notifications"]);
assert.deepEqual(labels("advertiser"), ["Home", "Creatives", "Find placements", "Campaigns", "Reports", "Notifications"]);
assert.equal(labels("admin").slice(0, 6).join(), "Inbox,Creatives,Applications,All bookings,People,System");
assert.ok(labels("admin").includes("My games"), "an admin keeps their own developer and advertiser tools");
assert.ok(!labels("developer").includes("Campaigns"), "developers do not see the advertiser menu");
assert.equal(homeFor("admin"), "/dashboard/admin/inbox");
assert.equal(homeFor("developer"), "/dashboard");

// badges
const badged = menuFor("developer", { requests: 3 }).flatMap((group) => group.items).find((item) => item.key === "requests");
assert.equal(badged.badge, 3);

// the active item
const home = { href: "/dashboard", exact: true };
const games = { href: "/dashboard/games" };
assert.ok(isActive(home, "/dashboard") && !isActive(home, "/dashboard/games"));
assert.ok(isActive(games, "/dashboard/games") && !isActive(games, "/dashboard/gamesx"));

// developer steps: one "next", in order
const states = (counts) => developerSteps(counts).map((step) => step.state).join();
assert.equal(states({}), "next,later,later,later");
assert.equal(states({ games: 1 }), "done,next,later,later");
assert.equal(states({ games: 1, placements: 4 }), "done,done,next,later");
assert.equal(states({ games: 1, placements: 4, open: 2, approved: 1 }), "done,done,done,done");

// advertiser pipeline
const pipeline = advertiserPipeline({
  creatives: [{ status: "approved" }, { status: "pending" }, { status: "rejected" }],
  campaigns: [{ id: "a" }, { id: "b" }, { id: "c" }],
  bookings: [
    { campaignId: "a", status: "pending", label: "Waiting for DeusADS review" },
    { campaignId: "b", status: "approved", label: "Live until 1 Nov" },
    { campaignId: "b", status: "approved", label: "Scheduled from 1 Dec" },
    { campaignId: "b", status: "ended", label: "Ended" },
  ],
});
assert.deepEqual(pipeline, { creatives: 3, approvedCreatives: 1, waitingCreatives: 1, drafts: 1, waiting: 2, live: 1, finished: 1 });

console.log("nav ok");
