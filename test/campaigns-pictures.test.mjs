// The Campaigns tab's data with rows per picture (migration 0062), read from an in-memory stand-in for Supabase.
// Run: node test/campaigns-pictures.test.mjs
import assert from "node:assert/strict";
import { countNew, loadCampaigns, statsDays } from "../lib/campaigns-data.js";
import { landingTest, loadPictureInputs } from "../lib/picture-landing.js";
import { notifyGoingLive } from "../lib/notify.js";
import { totalsFor } from "../lib/campaigns-view.js";

/** Tables as arrays; eq / in / is / gte filter them; a table listed in `missing` answers like one that does not exist. */
function stub(tables, { rpc = {}, missing = [] } = {}) {
  const from = (name) => {
    const filters = [];
    let op = "select";
    let payload = null;
    const run = () => {
      if (missing.includes(name)) return { data: null, error: { code: "42P01", message: "missing" } };
      const rows = (tables[name] ??= []);
      const hit = rows.filter((row) => filters.every(([kind, column, value]) => (kind === "eq" ? row[column] === value : kind === "in" ? value.includes(row[column]) : kind === "is" ? (row[column] ?? null) === value : kind === "gte" ? String(row[column]) >= value : true)));
      if (op === "insert") {
        rows.push(...[].concat(payload));
        return { data: [].concat(payload), error: null };
      }
      return { data: hit, error: null };
    };
    const builder = {
      select: () => builder,
      insert: (value) => ((op = "insert"), (payload = value), builder),
      upsert: (value) => ((op = "insert"), (payload = value), builder),
      eq: (column, value) => (filters.push(["eq", column, value]), builder),
      neq: () => builder,
      in: (column, value) => (filters.push(["in", column, value]), builder),
      is: (column, value) => (filters.push(["is", column, value]), builder),
      gte: (column, value) => (filters.push(["gte", column, value]), builder),
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: run().error }),
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  };
  return {
    tables,
    from,
    rpc: async (fn, args) => (rpc[fn] ? { data: rpc[fn](args), error: null } : { data: null, error: { code: "PGRST202", message: `no ${fn}` } }),
    storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://files/${path}` } }) }) },
  };
}

const NOW = Date.parse("2026-11-23T12:00:00Z");
const days = statsDays(NOW);
const today = days.at(-1);
const GAME = "game-2313";
const ADV = "adv-1";
const DEV = "dev-1";

// The pilot's case: seven placements, one creative with pictures for 1:1 and 16:9 and a banner as its main picture.
const placements = [
  ["ball1", "Ball_1", 1], ["ball2", "Ball_2", 1], ["corner1", "Corner_1", 1.7778], ["corner2", "Corner_2", 1.7778],
  ["wide", "DeusAd Placement 21x9", 2.3333], ["topleft", "Top_Left", 2.3333], ["four", "DeusAd Placement 4x3", 1.3333],
].map(([id, label, aspect_ratio]) => ({ id, label, external_id: id, game_id: GAME, aspect_ratio }));
const creative = (id, name, width_px, height_px) => ({ id, name, storage_path: `main/${id}.png`, ad_category: "finance", width_px, height_px, safe_x: 0.15, safe_y: 0.15, safe_w: 0.7, safe_h: 0.7, format_crops: null });
const booking = (campaign_id, creative_id, placement_id, extra = {}) => ({ campaign_id, advertiser_id: ADV, developer_id: DEV, creative_id, placement_id, status: "approved", created_at: "2026-11-23T10:58:21Z", starts_on: null, ends_on: null, ...extra });

function world({ extraTables = {}, stats = [], paid = [] } = {}) {
  return stub(
    {
      placements,
      games: [{ id: GAME, name: "2313", owner_id: DEV }],
      campaigns: [{ id: "camp-pay", name: "DeusPAY_1", paused_at: null, resume_on: null, budget: 500, budget_spent: 0, budget_closed_at: null }, { id: "camp-tall", name: "Tall only", paused_at: null, resume_on: null, budget: null, budget_spent: 0, budget_closed_at: null }],
      creatives: [creative("sq", "Square", 681, 240), creative("tall", "Tower", 240, 681)],
      creative_assets: [
        { id: "a1", creative_id: "sq", format_id: "r1x1", aspect: 1, storage_path: "assets/sq-1x1.png", status: "approved" },
        { id: "a2", creative_id: "sq", format_id: "r16x9", aspect: 1.7778, storage_path: "assets/sq-16x9.png", status: "approved" },
        { id: "a3", creative_id: "sq", format_id: "r3x4", aspect: 0.75, storage_path: "assets/sq-3x4.png", status: "approved" },
      ],
      accounts: [{ id: ADV, email: "pay@example.com", company: "DeusADS" }],
      bookings: [...placements.map((placement) => booking("camp-pay", "sq", placement.id)), ...placements.map((placement) => booking("camp-tall", "tall", placement.id))],
      game_ad_controls: [],
      game_category_blocks: [{ game_id: GAME, category: "finance", blocked: false }],
      game_ad_seen: [{ game_id: GAME, kind: "campaign", target_id: "camp-pay" }, { game_id: GAME, kind: "creative", target_id: "sq" }],
      game_ad_control_log: [],
      game_picture_blocks: [],
      ...extraTables,
    },
    { rpc: { game_picture_stats: () => stats, wallet_game_pictures: () => paid, game_campaign_stats: () => [] } }
  );
}

// ---- one row per picture; the campaign with nothing to show is not in the game
{
  const stats = [
    { placement_id: "ball1", creative_id: "sq", day: today, views: 30, visible_sum: 90, visible_n: 30 },
    { placement_id: "ball2", creative_id: "sq", day: today, views: 10, visible_sum: 20, visible_n: 10 },
    { placement_id: "corner1", creative_id: "sq", day: today, views: 7, visible_sum: 7, visible_n: 7 },
    { placement_id: "topleft", creative_id: "sq", day: days.at(-2), views: 5, visible_sum: 10, visible_n: 5 },
  ];
  const paid = [
    { day: today, campaign_id: "camp-pay", creative_id: "sq", placement_id: "ball1", impressions: 30 },
    { day: today, campaign_id: "camp-pay", creative_id: "sq", placement_id: "ball2", impressions: 8 },
    { day: today, campaign_id: "camp-pay", creative_id: "sq", placement_id: "corner1", impressions: 7 },
  ];
  const service = world({ stats, paid });
  const model = await loadCampaigns({ db: service, service, gameId: GAME, now: NOW });
  assert.equal(model.error, undefined);
  assert.equal(model.pictures, true);
  assert.equal(model.wallet, true);
  assert.deepEqual(model.campaigns.map((campaign) => campaign.name), ["DeusPAY_1"], "a campaign none of whose pictures fits a placement is not listed");
  const [campaign] = model.campaigns;
  assert.equal(campaign.base, "active");
  assert.deepEqual(
    campaign.creatives.map((row) => [row.name, row.format, row.cropped, row.placements.join("+")]),
    [
      ["Square", "21:9", true, "DeusAd Placement 21x9+Top_Left"],
      ["Square", "16:9", false, "Corner_1+Corner_2"],
      ["Square", "1:1", false, "Ball_1+Ball_2"],
    ],
    "the pictures that land, widest first; the 3:4 picture has no placement and the 4:3 placement gets nothing"
  );
  const [banner, wide, square] = campaign.creatives;
  assert.equal(square.id, "sq:r1x1");
  assert.equal(square.creativeId, "sq");
  assert.equal(square.url, "https://files/assets/sq-1x1.png", "the picture made for the shape");
  assert.equal(banner.url, "https://files/main/sq.png", "a custom shape shows the main picture");
  assert.ok(banner.frame && banner.frame.width > 100, "and says where to draw it inside the shape");
  assert.equal(wide.frame, null);
  // figures: the placements of one shape added up, paid beside them
  assert.deepEqual(totalsFor(square.figures, 30), { views: 40, sum: 110, n: 40, paid: 38 });
  assert.deepEqual(totalsFor(wide.figures, 30), { views: 7, sum: 7, n: 7, paid: 7 });
  assert.deepEqual(totalsFor(banner.figures, 30), { views: 5, sum: 10, n: 5, paid: 0 });
  assert.equal(campaign.isNew, false);
  assert.equal(square.isNew, false);
  // the badge on the tab counts the same campaigns: the one that shows nothing is not news
  assert.equal(await countNew({ service, gameId: GAME }), 0);
}

// ---- a picture blocked on its own comes with the controls; history in a shape that no longer has a place stays a row
{
  const gone = { id: "old", label: "Old poster", external_id: "old", game_id: GAME, aspect_ratio: 3 };
  const service = world({
    extraTables: { game_picture_blocks: [{ game_id: GAME, creative_id: "sq", shape: "r16x9", reason: "Low picture quality", comment: null }] },
    stats: [{ placement_id: "old", creative_id: "sq", day: today, views: 4, visible_sum: 4, visible_n: 4 }],
  });
  service.tables.placements = [...placements, gone]; // the placement is still known, but nothing is booked on it
  const model = await loadCampaigns({ db: service, service, gameId: GAME, now: NOW });
  assert.deepEqual(model.controls, [{ game_id: GAME, scope: "picture", target_id: "sq:r16x9", state: "blocked", reason: "Low picture quality", comment: null }]);
  const rows = model.campaigns[0].creatives;
  assert.deepEqual(rows.map((row) => [row.format, row.base, row.placements.length]), [["21:9", "active", 2], ["16:9", "active", 2], ["1:1", "active", 2], ["3:1", "ended", 0]]);
  assert.equal(totalsFor(rows.at(-1).figures, 30).views, 4);
}

// ---- before migration 0062 the tab lists creatives, as it did
{
  const service = world();
  const legacy = stub(service.tables, { rpc: { game_campaign_stats: () => [{ creative_id: "sq", day: today, views: 9, visible_sum: 9, visible_n: 9 }] }, missing: ["game_picture_blocks"] });
  const model = await loadCampaigns({ db: legacy, service: legacy, gameId: GAME, now: NOW });
  assert.equal(model.pictures, false);
  assert.deepEqual(model.campaigns.map((campaign) => [campaign.name, campaign.creatives.map((row) => row.id)]), [["DeusPAY_1", ["sq"]], ["Tall only", ["tall"]]]);
  assert.equal(totalsFor(model.campaigns[0].creatives[0].figures, 30).views, 9);
  assert.equal(model.campaigns[0].creatives[0].shape, undefined);
}

// ---- which booking shows a picture: what the advertiser's screens and the counters ask
{
  const service = world();
  const inputs = await loadPictureInputs(service, { creativeIds: ["sq", "tall", "sq"], placementIds: placements.map((placement) => placement.id) });
  const lands = landingTest(inputs);
  assert.deepEqual(placements.filter((placement) => lands("sq", placement.id)).map((placement) => placement.id), ["ball1", "ball2", "corner1", "corner2", "wide", "topleft"]);
  assert.deepEqual(placements.filter((placement) => lands("tall", placement.id)).map((placement) => placement.id), [], "a tall poster fits none of these shapes");
  assert.equal(lands("unknown", "ball1"), true, "what is not known is not hidden");
  assert.equal(landingTest(null)("tall", "four"), true, "nor is anything when the read failed");
  const broken = stub(service.tables, { missing: ["creative_assets"] });
  assert.equal(await loadPictureInputs(broken, { creativeIds: ["sq"], placementIds: ["ball1"] }), null);
}

// ---- a developer is told about a new ad only where it shows something
{
  const service = world();
  await notifyGoingLive(service, [{ developerId: DEV, gameId: GAME, campaignId: "camp-tall", creativeId: "tall", placementId: "four" }]);
  assert.equal((service.tables.notifications ?? []).length, 0, "nothing of it fits that placement: no notice");
  await notifyGoingLive(service, [{ developerId: DEV, gameId: GAME, campaignId: "camp-pay", creativeId: "sq", placementId: "four" }, { developerId: DEV, gameId: GAME, campaignId: "camp-pay", creativeId: "sq", placementId: "ball1" }]);
  assert.equal((service.tables.notifications ?? []).length, 1, "one notice for the placement where it shows");
}

console.log("campaigns pictures: all checks passed");
