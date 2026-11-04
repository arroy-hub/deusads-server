import assert from "node:assert/strict";
import { KEEP_MS, fitChanges, fitNotices, isLapsed, pairFit, reconcileFit } from "../lib/audience-watch.js";

// ---- the rules, alone
const hour = KEEP_MS;
assert.equal(hour, 3600000);
const since = "2026-11-04T10:00:00.000Z";
const at = (ms) => Date.parse(since) + ms;
assert.equal(isLapsed({ fits: false, since }, at(hour - 1)), false, "listed for the whole hour");
assert.equal(isLapsed({ fits: false, since }, at(hour)), true, "then it leaves");
assert.equal(isLapsed({ fits: true, since }, at(5 * hour)), false, "a campaign that fits never leaves");
assert.equal(isLapsed(null, at(hour)), false);
assert.equal(isLapsed({ fits: false, since: "garbage" }, at(hour)), false);

assert.deepEqual(pairFit([]), { fits: true, why: "" });
assert.equal(pairFit([null, { scope: "creative", why: "no matching country" }]).fits, true, "one creative that may be shown is enough");
assert.deepEqual(pairFit([{ scope: "creative", why: "no matching country" }, { scope: "campaign", why: "no matching genre" }]), { fits: false, why: "no matching genre" });

const cur = (gameId, campaignId, fits) => ({ gameId, campaignId, advertiserId: "a1", fits, why: fits ? "" : "no matching genre" });
const row = (game_id, campaign_id, fits) => ({ game_id, campaign_id, fits, since });
const changes = fitChanges([cur("g1", "c1", false), cur("g1", "c2", true), cur("g1", "c3", true), cur("g2", "c1", true)], [row("g1", "c1", true), row("g1", "c2", true), row("g1", "c3", false), row("g9", "c9", true)]);
assert.deepEqual([changes.lost, changes.back, changes.start, changes.stale].map((list) => list.length), [1, 1, 1, 1]);
assert.equal(changes.lost[0].campaignId, "c1");
assert.equal(changes.back[0].campaignId, "c3");
assert.equal(changes.start[0].gameId, "g2");

const names = { games: new Map([["g1", { name: "Pocket Harvest", ownerId: "dev1" }]]), campaigns: new Map([["c1", { name: "Spring" }], ["c2", { name: "Winter" }]]) };
const one = fitNotices({ lost: [cur("g1", "c1", false)] }, names);
assert.deepEqual(one.map((item) => [item.accountId, item.type, item.link]), [["dev1", "dev_audience_fit", "/dashboard/g/g1?tab=campaigns&campaign=c1"], ["a1", "adv_audience_fit", "/dashboard/advertising/c/c1"]]);
assert.equal(one[0].text, '"Spring" stopped showing in Pocket Harvest: the game no longer fits its audience (no matching genre).');
assert.equal(one[1].text, '"Spring" stopped showing in Pocket Harvest: the game no longer fits the audience (no matching genre).');
const many = fitNotices({ back: [cur("g1", "c1", true), cur("g1", "c2", true)] }, names);
assert.equal(many[0].text, "2 campaigns are showing again in Pocket Harvest: the game fits their audience again.");
assert.equal(many[0].link, "/dashboard/g/g1?tab=campaigns", "several: the tab, not one campaign");
assert.equal(many[1].text, "2 of your campaigns are showing again in Pocket Harvest: the game fits their audience again.");
assert.equal(many[1].link, "/dashboard/advertising");
assert.deepEqual(fitNotices({}, names), []);

// ---- the whole run against a small in-memory database
function memory(tables, broken = new Set()) {
  const rowsOf = (name) => (tables[name] ??= []);
  return {
    tables,
    from(name) {
      const query = (action, payload) => {
        const filters = [];
        let limit = Infinity;
        let returning = false;
        const run = () => {
          if (broken.has(name)) return { data: null, error: { code: "42P01" } };
          const hit = rowsOf(name).filter((item) => filters.every((test) => test(item)));
          if (action === "update") {
            hit.forEach((item) => Object.assign(item, payload));
            return { data: returning ? hit.map((item) => ({ ...item })) : null, error: null };
          }
          if (action === "delete") {
            tables[name] = rowsOf(name).filter((item) => !hit.includes(item));
            return { data: null, error: null };
          }
          return { data: hit.slice(0, limit).map((item) => ({ ...item })), error: null };
        };
        const q = {
          eq: (column, value) => (filters.push((item) => item[column] === value), q),
          in: (column, values) => (filters.push((item) => values.includes(item[column])), q),
          limit: (count) => ((limit = count), q),
          select: () => ((returning = true), q),
          maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
          then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
        };
        return q;
      };
      return {
        select: () => query("select"),
        update: (payload) => query("update", payload),
        delete: () => query("delete"),
        upsert: async (list, options) => {
          const keys = options.onConflict.split(",");
          for (const item of [].concat(list)) {
            const found = rowsOf(name).findIndex((existing) => keys.every((key) => existing[key] === item[key]));
            if (found < 0) rowsOf(name).push({ ...item });
            else if (!options.ignoreDuplicates) Object.assign(rowsOf(name)[found], item);
          }
          return { data: null, error: null };
        },
        insert: async (item) => {
          rowsOf(name).push({ id: String(rowsOf(name).length + 1), ...item });
          return { error: null };
        },
      };
    },
  };
}

const database = () => ({
  games: [{ id: "g1", name: "Pocket Harvest", owner_id: "dev1", genres: ["racing"], platforms: ["quest"], languages: ["en"], countries: ["de"] }],
  placements: [{ id: "p1", game_id: "g1" }, { id: "p2", game_id: "g1" }],
  campaigns: [{ id: "c1", name: "Spring Sale", targeting: { genres: ["racing"] } }, { id: "c2", name: "Winter", targeting: null }],
  creatives: [{ id: "k1", targeting: null }, { id: "k2", targeting: null }],
  bookings: [
    { campaign_id: "c1", creative_id: "k1", placement_id: "p1", advertiser_id: "adv1", status: "approved" },
    { campaign_id: "c1", creative_id: "k1", placement_id: "p2", advertiser_id: "adv1", status: "approved" },
    { campaign_id: "c2", creative_id: "k2", placement_id: "p1", advertiser_id: "adv2", status: "approved" },
  ],
  campaign_fit: [],
  notifications: [],
});

const T0 = Date.parse("2026-11-04T10:00:00.000Z");
const min = (n) => T0 + n * 60000;
const db = memory(database());
const fitRow = (campaign) => db.tables.campaign_fit.find((item) => item.campaign_id === campaign);

// first look: remembered, nobody is told
assert.deepEqual(await reconcileFit(db, { gameId: "g1", now: min(0) }), { started: 2, lost: 0, back: 0 });
assert.equal(db.tables.notifications.length, 0);
assert.deepEqual(db.tables.campaign_fit.map((item) => item.fits), [true, true]);

// the developer turns a racing game into a puzzle game
db.tables.games[0].genres = ["puzzle"];
assert.deepEqual(await reconcileFit(db, { gameId: "g1", now: min(5) }), { started: 0, lost: 1, back: 0 });
assert.equal(fitRow("c1").fits, false);
assert.equal(fitRow("c1").since, new Date(min(5)).toISOString());
assert.equal(fitRow("c1").why, "no matching genre");
assert.equal(fitRow("c2").fits, true, "a campaign without an audience still fits");
assert.deepEqual(db.tables.notifications.map((item) => item.account_id), ["dev1", "adv1"]);
assert.match(db.tables.notifications[0].text, /^"Spring Sale" stopped showing in Pocket Harvest/);
assert.equal(db.tables.notifications[0].link, "/dashboard/g/g1?tab=campaigns&campaign=c1");

// the same state again tells nobody twice, and the clock keeps running from the first moment
assert.deepEqual(await reconcileFit(db, { gameId: "g1", now: min(30) }), { started: 0, lost: 0, back: 0 });
assert.equal(db.tables.notifications.length, 2);
assert.equal(isLapsed(fitRow("c1"), min(5) + hour - 1), false);
assert.equal(isLapsed(fitRow("c1"), min(5) + hour), true);

// it fits again
db.tables.games[0].genres = ["racing"];
assert.deepEqual(await reconcileFit(db, { gameId: "g1", now: min(90) }), { started: 0, lost: 0, back: 1 });
assert.equal(fitRow("c1").fits, true);
assert.equal(db.tables.notifications.length, 4);
assert.match(db.tables.notifications[2].text, /is showing again in Pocket Harvest/);
assert.equal(isLapsed(fitRow("c1"), min(500)), false);

// a booking that is gone is forgotten
db.tables.bookings = db.tables.bookings.filter((item) => item.campaign_id !== "c2");
await reconcileFit(db, { gameId: "g1", now: min(100) });
assert.deepEqual(db.tables.campaign_fit.map((item) => item.campaign_id), ["c1"]);

// one campaign across every game (an advertiser edited the audience)
db.tables.campaigns[0].targeting = { genres: ["puzzle"] };
assert.equal((await reconcileFit(db, { campaignId: "c1", now: min(110) })).lost, 1);
db.tables.campaigns[0].targeting = { genres: ["racing"] };
assert.equal((await reconcileFit(db, { now: min(120) })).back, 1, "no scope: everything");

// without migration 0058 nothing is claimed and nothing breaks
assert.deepEqual(await reconcileFit(memory(database(), new Set(["campaign_fit"])), { gameId: "g1", now: min(0) }), { skipped: "table" });

console.log("audience-watch tests passed");
