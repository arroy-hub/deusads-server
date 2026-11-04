// notify() honours the person's choice per kind of notification. Run: node test/notify.test.mjs
import assert from "node:assert/strict";
import { deliveryOf, notify, notifyMany } from "../lib/notify.js";

// A tiny stand-in for the Supabase client: prefs by "account:type", records what was inserted.
function fake({ prefs = {}, prefsError = false } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table === "notifications") return { insert: async (row) => (inserted.push(row), { error: null }) };
      if (table === "notification_prefs") {
        const q = {};
        const builder = {
          select: () => builder,
          eq: (column, value) => ((q[column] = value), builder),
          maybeSingle: async () => (prefsError ? { data: null, error: { code: "42P01" } } : { data: prefs[`${q.account_id}:${q.type}`] ?? null, error: null }),
        };
        return builder;
      }
      if (table === "accounts") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "a@b.co" } }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// defaults: the bell, no email
let db = fake();
await notify(db, { accountId: "a1", text: "hello", link: "/x", type: "dev_campaign" });
assert.equal(db.inserted.length, 1);
assert.deepEqual(db.inserted[0], { account_id: "a1", text: "hello", link: "/x" });

// the bell switched off: nothing under the bell
db = fake({ prefs: { "a1:dev_campaign": { bell: false, email: false } } });
await notify(db, { accountId: "a1", text: "hello", type: "dev_campaign" });
assert.equal(db.inserted.length, 0);
// ... but another kind still arrives
await notify(db, { accountId: "a1", text: "hello", type: "dev_withdrew" });
assert.equal(db.inserted.length, 1);

// a call without a type keeps the defaults
db = fake();
await notify(db, { accountId: "a1", text: "old style" });
assert.equal(db.inserted.length, 1);

// the table is missing (migration 0030 not applied): defaults
db = fake({ prefsError: true });
await notify(db, { accountId: "a1", text: "hello", type: "adv_blocked" });
assert.equal(db.inserted.length, 1);
assert.deepEqual(await deliveryOf(db, "a1", "adv_blocked"), { bell: true, email: false });

// product news never reaches the bell
db = fake();
await notify(db, { accountId: "a1", text: "news", type: "product_news" });
assert.equal(db.inserted.length, 0);

// several people, each with their own choice; duplicates removed
db = fake({ prefs: { "b:dev_campaign": { bell: false, email: false } } });
await notifyMany(db, ["a", "b", "a", null], "hi", "/x", "dev_campaign");
assert.deepEqual(db.inserted.map((row) => row.account_id), ["a"]);

// empty input does nothing
db = fake();
await notify(db, { accountId: null, text: "x" });
await notify(db, { accountId: "a", text: "" });
assert.equal(db.inserted.length, 0);

// a new ad going live: one notice per developer, straight to the Campaigns tab of the game
{
  const { liveNotices, gameCampaignsLink } = await import("../lib/notify.js");
  assert.equal(gameCampaignsLink("g1"), "/dashboard/g/g1?tab=campaigns");
  const one = liveNotices([{ developerId: "d1", gameId: "g1" }, { developerId: "d1", gameId: "g1" }, { developerId: null, gameId: "g9" }]);
  assert.equal(one.length, 1, "one notice per developer, however many placements");
  assert.equal(one[0].accountId, "d1");
  assert.equal(one[0].link, "/dashboard/g/g1?tab=campaigns");
  const many = liveNotices([{ developerId: "d1", gameId: "g1" }, { developerId: "d1", gameId: "g2" }, { developerId: "d2", gameId: "g3" }]);
  assert.equal(many.find((n) => n.accountId === "d1").link, "/dashboard/games", "several games: the list of games");
  assert.match(many.find((n) => n.accountId === "d1").text, /several of your games/);
  assert.equal(many.find((n) => n.accountId === "d2").link, "/dashboard/g/g3?tab=campaigns");
  assert.equal(liveNotices([{ developerId: "d1", gameId: null }])[0].link, "/dashboard/games", "unknown game: the list");
  assert.deepEqual(liveNotices([]), []);
  assert.equal(gameCampaignsLink("g1", "c1"), "/dashboard/g/g1?tab=campaigns&campaign=c1");
  assert.equal(liveNotices([{ developerId: "d1", gameId: "g1", campaignId: "c1" }, { developerId: "d1", gameId: "g1", campaignId: "c1" }])[0].link, "/dashboard/g/g1?tab=campaigns&campaign=c1", "opens the campaign that was added");
  assert.equal(liveNotices([{ developerId: "d1", gameId: "g1", campaignId: "c1" }, { developerId: "d1", gameId: "g1", campaignId: "c2" }])[0].link, "/dashboard/g/g1?tab=campaigns", "two campaigns: the tab, not one of them");
}
console.log("notify: all checks passed");
