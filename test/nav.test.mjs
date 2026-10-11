// Menus per role and the Home steps. Run: node test/nav.test.mjs
import assert from "node:assert/strict";
import { menuFor, homeFor, isActive } from "../lib/nav.js";
import { developerSteps, advertiserPipeline } from "../lib/home-rules.js";

const labels = (role) => menuFor(role).flatMap((group) => group.items.map((item) => item.label));

assert.deepEqual(labels("developer"), ["Home", "My games", "Now showing"]);
assert.deepEqual(labels("advertiser"), ["Home", "Creatives", "Find placements", "Campaigns", "Reports"]);
assert.equal(labels("admin").slice(0, 4).join(), "Review creatives,All bookings,Users,System");
assert.ok(!labels("admin").includes("Inbox") && !labels("admin").includes("People"), "Inbox is merged into the review page; People is called Users");
assert.ok(!["developer", "advertiser", "admin"].some((role) => labels(role).includes("Notifications")), "notifications live behind the bell, not in the menu");
// an admin's own library is not confused with the review page
assert.equal(labels("admin").filter((label) => /creatives/i.test(label)).join(), "Review creatives,My creatives");
assert.ok(labels("admin").includes("My games"), "an admin keeps their own developer and advertiser tools");
assert.ok(!labels("developer").includes("Campaigns"), "developers do not see the advertiser menu");
assert.equal(homeFor("admin"), "/dashboard/admin");
assert.equal(homeFor("developer"), "/dashboard");

// badges
const badged = menuFor("developer", { requests: 3 }).flatMap((group) => group.items).find((item) => item.key === "requests");
assert.equal(badged.badge, 3);

// the active item
const home = { href: "/dashboard", exact: true };
const games = { href: "/dashboard/games" };
assert.ok(isActive(home, "/dashboard") && !isActive(home, "/dashboard/games"));
assert.ok(isActive(games, "/dashboard/games") && !isActive(games, "/dashboard/gamesx"));

// the waiting count shows on the review page; a game's own pages stay inside "My games"
const review = menuFor("admin", { inbox: 4 }).flatMap((group) => group.items).find((item) => item.key === "modCreatives");
assert.equal(review.badge, 4);
const myGames = menuFor("developer", {}, [{ href: "/dashboard/g/1", label: "A" }])[0].items.find((item) => item.key === "games");
assert.ok(isActive(myGames, "/dashboard/g/1") && isActive(myGames, "/dashboard/g/1/anything") && isActive(myGames, "/dashboard/games"));
assert.ok(!isActive(myGames, "/dashboard/gx") && !isActive(myGames, "/dashboard"));
assert.equal(myGames.children.length, 1);

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
