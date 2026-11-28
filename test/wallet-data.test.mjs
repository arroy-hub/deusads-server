// The wallet's loaders run against a stand-in for the database: every branch that reads campaigns is walked once, so a
// slip in the order of the code (a value used before it exists) fails here and not on the page.
import assert from "node:assert/strict";
import { loadCampaignForDeveloper, loadDeveloperWallet, loadPlatformWallet } from "../lib/wallet-data.js";

const tables = {
  campaigns: [
    { id: "c1", name: "Summer", advertiser_id: "a1", paused_at: null, plan: { launched: true }, budget: null, budget_spent: 0, cover: null, category: "food_drink", targeting: null },
    { id: "c2", name: "Winter", advertiser_id: "a1", paused_at: null, plan: { launched: true }, budget: null, budget_spent: 0, cover: "preset:terracotta", category: "", targeting: null },
  ],
  accounts: [{ id: "a1", email: "a@x.example", company: "Northwind" }, { id: "d1", email: "d@x.example", company: "Pixel" }],
  bookings: [{ campaign_id: "c1", creative_id: "k1", placement_id: "p1", developer_id: "d1", status: "approved", created_at: "2026-11-01" }],
  creatives: [{ id: "k1", name: "Can", storage_path: "a1/can.png", ad_category: "food_drink", width_px: 1600, height_px: 900, safe_x: 0.15, safe_y: 0.15, safe_w: 0.7, safe_h: 0.7, format_crops: null }],
  creative_assets: [],
  placements: [{ id: "p1", label: "Wall", external_id: "plc_1", aspect_ratio: 1.778, game_id: "g1" }],
  games: [{ id: "g1", name: "Neon", icon_path: null, owner_id: "d1", created_at: "2026-10-01" }],
  wallet_earnings: [{ developer_id: "d1", campaign_id: "c1", creative_id: "k1", placement_id: "p1", game_id: "g1", day: "2026-11-20", impressions: 500, amount: 3 }],
  wallet_payouts: [],
};
function query(name) {
  let list = [...(tables[name] ?? [])];
  const api = {
    select: () => api, order: () => api, limit: () => api,
    eq(key, value) { list = list.filter((row) => row[key] === value); return api; },
    neq(key, value) { list = list.filter((row) => row[key] !== value); return api; },
    in(key, values) { list = list.filter((row) => values.includes(row[key])); return api; },
    gte(key, value) { list = list.filter((row) => row[key] >= value); return api; },
    lte(key, value) { list = list.filter((row) => row[key] <= value); return api; },
    lt(key, value) { list = list.filter((row) => row[key] < value); return api; },
    is: () => api, not: () => api,
    maybeSingle: () => Promise.resolve({ data: list[0] ?? null, error: null }),
    then: (done, failed) => Promise.resolve({ data: list, error: null }).then(done, failed),
  };
  return api;
}
const day = { day: "2026-11-20", game_id: "g1", impressions: 500, amount: 3 };
const service = {
  from: query,
  rpc(name) {
    if (name === "wallet_developer") return Promise.resolve({ data: { total: { impressions: 500, amount: 3 }, today: { impressions: 0, amount: 0 }, daily: [day], campaigns: [{ campaign_id: "c1", advertiser_id: "a1", game_id: "g1", impressions: 500 }, { campaign_id: "c2", advertiser_id: "a1", game_id: "g1", impressions: 10 }] }, error: null });
    if (name === "wallet_platform") return Promise.resolve({ data: { total: { impressions: 500, amount: 3 }, today: {}, daily: [], campaigns: [{ campaign_id: "c1", advertiser_id: "a1", impressions: 500, amount: 3 }], games: [{ game_id: "g1", developer_id: "d1", impressions: 500, amount: 3 }], added: 10, no_limit: 0 }, error: null });
    return Promise.resolve({ data: null, error: null });
  },
  storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.example/${path}` } }) }) },
};
const now = Date.parse("2026-11-28T12:00:00Z");

const dev = await loadDeveloperWallet(service, "d1", { now });
assert.equal(dev.missing, undefined);
const summer = dev.campaigns[30].find((c) => c.id === "c1");
assert.equal(summer.name, "Summer");
assert.equal(summer.category, "food_drink");
// no picture chosen: the picture of its newest booked creative, as on the advertiser's own card
assert.match(summer.coverCss, /cdn\.example\/a1\/can\.png/);
// a colour chosen: that colour, no picture
assert.doesNotMatch(dev.campaigns[30].find((c) => c.id === "c2").coverCss, /url\(/);
assert.deepEqual(dev.payouts, []);

const platform = await loadPlatformWallet(service, { now });
assert.equal(platform.campaigns[0].name, "Summer");
assert.equal(platform.paidOut, 0);

const one = await loadCampaignForDeveloper(service, "d1", "c1", { days: 30, now });
assert.equal(one.name, "Summer");
assert.equal(one.total.impressions, 500);
assert.equal(one.creatives[0].pictures[0].label, "16:9");
assert.equal(await loadCampaignForDeveloper(service, "d1", "nope", { days: 30, now }), null);
console.log("wallet data: ok");
