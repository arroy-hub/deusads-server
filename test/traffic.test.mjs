import assert from "node:assert/strict";
import { TRAFFIC_HIGH, TRAFFIC_MIN_VIEWS, TRAFFIC_PERIODS, TRAFFIC_RULES, TRAFFIC_WATCH, levelOf, loadTraffic, loadTrafficSamples, periodFrom, samplesTable, trafficTable } from "../lib/traffic.js";
import { menuFor } from "../lib/nav.js";

// the period comes from the address; anything else is 30 days
{
  assert.deepEqual(TRAFFIC_PERIODS, [7, 30, 90]);
  assert.equal(periodFrom("7"), 7);
  assert.equal(periodFrom("90"), 90);
  assert.equal(periodFrom("365"), 30, "the database looks back 90 days at most");
  assert.equal(periodFrom(undefined), 30);
  assert.equal(periodFrom("abc"), 30);
}

// how worried to be: by the share of flagged views, and only with enough views
{
  assert.equal(levelOf(1000, 0), "ok");
  assert.equal(levelOf(1000, 49), "ok");
  assert.equal(levelOf(1000, 50), "watch", "5% is worth a look");
  assert.equal(levelOf(1000, 199), "watch");
  assert.equal(levelOf(1000, 200), "high", "20% is worth a close look");
  assert.equal(levelOf(TRAFFIC_MIN_VIEWS - 1, 30), "few", "a big share of very few views says nothing");
  assert.equal(levelOf(TRAFFIC_MIN_VIEWS - 1, 0), "ok");
  assert.equal(levelOf(TRAFFIC_MIN_VIEWS, TRAFFIC_MIN_VIEWS), "high");
  assert.ok(TRAFFIC_WATCH < TRAFFIC_HIGH);
}

// per game and in total
{
  const t = trafficTable([
    { game_id: "g2", game_name: "Beta", views: "800", flagged: "0", future: 0, stale: 0, too_long: 0, no_time: 0, behind: 0, session: 0, player: 0 },
    { game_id: "g1", game_name: "Alpha", views: "1000", flagged: "300", future: "1", stale: 0, too_long: 0, no_time: "2", behind: 0, session: "250", player: "100" },
    { game_id: "g3", game_name: null, views: 10, flagged: 4, future: 0, stale: 0, too_long: 0, no_time: 4, behind: 0, session: 0, player: 0 },
  ]);
  assert.deepEqual(t.games.map((game) => game.id), ["g1", "g3", "g2"], "most marked first");
  assert.equal(t.games[0].share, 0.3);
  assert.equal(t.games[0].level, "high");
  assert.equal(t.games[0].rules.session, 250);
  assert.equal(t.games[1].name, "Game", "a game without a name still has one");
  assert.equal(t.games[1].level, "few");
  assert.equal(t.games[2].level, "ok");
  assert.equal(t.totals.views, 1810);
  assert.equal(t.totals.flagged, 304);
  assert.equal(t.totals.share, 304 / 1810);
  assert.deepEqual(t.totals.rules.map((rule) => rule.id), TRAFFIC_RULES.map((rule) => rule.id), "always the same rules, in order");
  assert.equal(t.totals.rules.find((rule) => rule.id === "no_time").count, 6);
  assert.equal(t.totals.rules.find((rule) => rule.id === "session").count, 250);
  assert.equal(t.empty, false);
}

// nothing yet
{
  const none = trafficTable(null);
  assert.equal(none.empty, true);
  assert.equal(none.totals.share, 0);
  assert.equal(none.totals.rules.length, TRAFFIC_RULES.length);
}

// every rule has a name and an explanation
for (const rule of TRAFFIC_RULES) {
  assert.ok(rule.label.length > 0 && rule.hint.length > 0, rule.id);
}
assert.equal(new Set(TRAFFIC_RULES.map((rule) => rule.id)).size, TRAFFIC_RULES.length);

// the flagged views of one game
{
  const rows = samplesTable([
    { id: 7, occurred_at: "2026-10-17T10:00:00Z", received_at: "2026-10-17T10:01:00Z", session_id: "s1", install_id: "i1", placement: "Poster", visible_seconds: "0", view_distance: "2.5", view_angle: "120", rules: ["no_time", "behind"] },
    { id: 8, occurred_at: "2026-10-17T09:00:00Z", received_at: "2026-10-17T09:00:30Z", session_id: "s2", install_id: null, placement: null, visible_seconds: null, view_distance: null, view_angle: null, rules: ["future", "mystery"] },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seconds, 0, "zero seconds is a value, not a blank");
  assert.equal(rows[0].distance, 2.5);
  assert.equal(rows[0].angle, 120);
  assert.deepEqual(rows[0].rules.map((rule) => rule.label), ["No length", "Seen from behind"]);
  assert.equal(rows[1].seconds, null);
  assert.equal(rows[1].player, null);
  assert.equal(rows[1].rules[1].label, "mystery", "a rule the page does not know is shown by its id");
  assert.deepEqual(samplesTable(null), []);
}

// loaders: a database without migration 0040 switches the page off instead of failing
{
  const ok = await loadTraffic(async () => ({ data: [{ game_id: "g", game_name: "A", views: 100, flagged: 10 }] }));
  assert.equal(ok.missing, false);
  assert.equal(ok.games.length, 1);
  const missing = await loadTraffic(async () => ({ error: { code: "PGRST202" } }));
  assert.equal(missing.missing, true);
  assert.equal(missing.empty, true);
  const samples = await loadTrafficSamples(async () => ({ data: [{ id: 1, rules: ["stale"] }] }));
  assert.equal(samples.missing, false);
  assert.equal(samples.samples.length, 1);
  assert.deepEqual(await loadTrafficSamples(async () => ({ error: { code: "42883" } })), { missing: true, samples: [] });
}

// the admin menu has the page; nobody else does
{
  const keys = (role) => menuFor(role).flatMap((group) => group.items.map((item) => item.key));
  assert.ok(keys("admin").includes("traffic"));
  assert.ok(!keys("developer").includes("traffic"));
  assert.ok(!keys("advertiser").includes("traffic"));
  const item = menuFor("admin").flatMap((group) => group.items).find((entry) => entry.key === "traffic");
  assert.equal(item.href, "/dashboard/admin/traffic");
}

console.log("traffic tests passed");
