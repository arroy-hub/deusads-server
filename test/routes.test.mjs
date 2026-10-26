// End-to-end test of the SDK routes against an in-memory stand-in for the
// Supabase REST API. The real supabase-js client is used; only fetch is swapped.
// Run: node test/routes.test.mjs   (bundles the routes with esbuild first)
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const GAME = { id: "g1", owner_id: "o1", name: "Test Game", api_key: "key-1", genres: ["shooter", "social"], platforms: ["quest"], languages: ["en", "ru"] };
const db = { placements: [], impressions: [], assignments: [], creatives: [] };
// Tables from migration 0021 exist only while `organizationApplied` is true (else the stub answers PGRST205).
let organizationApplied = false;
const organization = { placement_places: [], placement_folders: [], placement_scene_off: [] };
let outdated = false;
let fillMissing = false; // migration 0037 not applied: no record_manifest_fill function
const fillLog = []; // what record_manifest_fill was asked to add, one entry per manifest request
let perfMissing = false; // migration 0038 not applied: no add_session_performance function
const perfLog = []; // what add_session_performance was asked to add, one entry per report
let interactionsMissing = false; // migration 0036 not applied: no placements.interactive, no impressions.interactions
let shapeMissing = false; // migration 0051 not applied: no shape_blocked, shape_level, shape_worst
let attentionMissing = false; // migration 0035 not applied: impressions has no view_distance and friends
let contextMissing = false; // migration 0034 not applied: game_sessions has no player-context columns
let cropMissing = false; // 0002 applied, 0003 not yet
let targetingMissing = false; // 0017 applied, 0018 not yet
let profileReads = 0; // how often the game's own description was read
let nextId = 1;
let gamesFailures = 0; // transient failures of the API key lookup still to serve

function fail(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function matches(row, params) {
  for (const [key, raw] of params) {
    if (["select", "on_conflict", "order", "columns", "limit", "or"].includes(key)) continue;
    if (key.includes(".")) continue; // filters on embedded resources are ignored here
    const value = row[key];
    if (raw.startsWith("eq.")) { if (String(value) !== raw.slice(3)) return false; }
    else if (raw.startsWith("in.(")) {
      const list = raw.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!list.includes(String(value))) return false;
    } else if (raw === "is.null") { if (value !== null && value !== undefined) return false; }
    else throw new Error("unsupported filter " + key + "=" + raw);
  }
  return true;
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  const table = url.pathname.replace("/rest/v1/", "");
  const params = [...url.searchParams.entries()];
  const body = init.body ? JSON.parse(init.body) : null;
  const text = url.search + (init.body ?? "");
  const prefer = new Headers(init.headers).get("prefer") ?? "";

  if (outdated && /removed_at|event_id/.test(text)) {
    return fail(400, "42703", "column does not exist");
  }
  if ((outdated || cropMissing) && /crop_/.test(text)) {
    return fail(400, "42703", "column does not exist");
  }
  if (interactionsMissing && ((table === "placements" && /\"interactive\"/.test(text)) || (table === "impressions" && /\"interactions\"/.test(text)))) {
    return fail(400, "42703", "column does not exist");
  }
  if (shapeMissing && /shape_blocked|shape_level|shape_worst/.test(text)) {
    return fail(400, "42703", "column does not exist");
  }
  if (attentionMissing && table === "impressions" && /view_distance/.test(text)) {
    return fail(400, "42703", "column does not exist");
  }
  if (contextMissing && table === "game_sessions" && /device_model|country|platform/.test(text)) {
    return fail(400, "42703", "column does not exist");
  }

  const ok = (rows, status = 200) =>
    new Response(JSON.stringify(rows), { status, headers: { "content-type": "application/json" } });

  if (table === "rpc/add_session_performance") {
    if (perfMissing) return fail(404, "PGRST202", "function not found");
    perfLog.push(body);
    return ok(null);
  }

  if (table === "rpc/record_manifest_fill") {
    if (fillMissing) return fail(404, "PGRST202", "function not found");
    fillLog.push(body);
    return ok(null);
  }

  if (targetingMissing && /targeting|genres/.test(text)) {
    return fail(400, "42703", "column does not exist");
  }

  if (table === "games") {
    if (gamesFailures > 0) {
      gamesFailures -= 1;
      // 502 is not retried by supabase-js itself (it retries 503/520 and network errors).
      return fail(502, "", "bad gateway");
    }
    // The key lookup (the SDK) and the profile read (by id) both land here.
    const byKey = url.searchParams.get("api_key") === `eq.${GAME.api_key}`;
    const byId = url.searchParams.get("id") === `eq.${GAME.id}`;
    if (method === "PATCH") return ok([]); // the SDK-signal stamp (migration 0024)
    if (byId) profileReads += 1;
    return ok(byKey || byId ? [GAME] : []);
  }

  const rows = db[table] ?? (organizationApplied ? organization[table] : undefined);
  if (!rows) return fail(404, "PGRST205", "no table " + table);

  if (method === "GET") {
    const list = rows.filter((r) => matches(r, params));
    if (table === "assignments") {
      // Like PostgREST: columns that were not selected are not returned.
      const select = url.searchParams.get("select") ?? "";
      return ok(
        list.map((assignment) => {
          const { crop_zoom, crop_x, crop_y, ...rest } = assignment;
          const row = /crop_/.test(select) ? assignment : rest;
          if (/targeting/.test(select) || !row.creatives) return row;
          const { targeting, ...creative } = row.creatives;
          return { ...row, creatives: creative };
        })
      );
    }
    return ok(list);
  }

  if (method === "POST") {
    const conflict = (url.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
    const ignore = prefer.includes("ignore-duplicates");
    const incoming = Array.isArray(body) ? body : [body];
    const keyOf = (r) => conflict.map((c) => String(r[c])).join("|");
    // Postgres rejects ON CONFLICT DO UPDATE touching one row twice.
    if (!ignore && conflict.length) {
      const keys = incoming.map(keyOf);
      if (new Set(keys).size !== keys.length) return fail(400, "21000", "cannot affect row a second time");
    }
    const written = [];
    for (const r of incoming) {
      const existing = conflict.length ? rows.find((x) => keyOf(x) === keyOf(r)) : null;
      if (existing) {
        if (ignore) continue;
        Object.assign(existing, r);
        written.push(existing);
      } else {
        const row = { id: String(nextId++), removed_at: null, ...r };
        rows.push(row);
        written.push(row);
      }
    }
    return ok(written, 201);
  }

  if (method === "PATCH") {
    const list = rows.filter((r) => matches(r, params));
    list.forEach((r) => Object.assign(r, body));
    return ok(list);
  }

  return fail(405, "X", "method");
};

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

// Inside the project so the bundle resolves node_modules.
const out = join(process.cwd(), "node_modules", ".cache", "deusads-routes-test");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: {
    placements: "app/v1/placements/route.js",
    events: "app/v1/events/route.js",
    manifest: "app/v1/manifest/route.js",
    sessions: "app/v1/sessions/route.js",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: out,
  external: ["@supabase/*"],
  // next/server needs a running Next.js request; the stand-in is described in the file.
  alias: { "next/server": join(process.cwd(), "test", "stubs", "next-server.mjs") },
  logLevel: "error",
});
const load = (name) => import(pathToFileURL(join(out, name + ".js")).href);
const placements = await load("placements");
const events = await load("events");
const manifest = await load("manifest");
const sessions = await load("sessions");

const post = (handler, body, key = GAME.api_key) =>
  handler.POST(
    new Request("https://x/v1", {
      method: "POST",
      headers: { "content-type": "application/json", "x-deusads-key": key },
      body: JSON.stringify(body),
    })
  );
const send = async (list, complete = true) => {
  const res = await post(placements, { complete, placements: list });
  return { status: res.status, body: await res.json() };
};
const live = () => db.placements.filter((p) => !p.removed_at).map((p) => p.external_id).sort();
const P = (id, label = id) => ({ externalId: id, label, aspectRatio: 1, widthM: 1, heightM: 1 });

let r;

// --- placements sync
r = await send([P("a"), P("b"), P("c")]);
assert.equal(r.status, 200); assert.equal(r.body.saved, 3);
assert.deepEqual(live(), ["a", "b", "c"]);

r = await send([P("a"), P("c")]);
assert.equal(r.status, 200);
assert.deepEqual(r.body.removed, [{ externalId: "b", label: "b" }]);
assert.deepEqual(live(), ["a", "c"]);

r = await send([P("a")], false); // old SDK: partial list, nothing removed
assert.deepEqual(live(), ["a", "c"]);

r = await send([P("a"), P("b"), P("c")]);
assert.deepEqual(r.body.restored, [{ externalId: "b", label: "b" }]);
assert.deepEqual(live(), ["a", "b", "c"]);

r = await send([P("a"), P("a")]);
assert.equal(r.status, 409); assert.deepEqual(r.body.duplicates, ["a"]);
assert.deepEqual(live(), ["a", "b", "c"], "a rejected batch changes nothing");

r = await send([]);
assert.equal(r.status, 200); assert.equal(r.body.removed.length, 3);
assert.deepEqual(live(), []);

r = await send([], false);
assert.equal(r.status, 400);

r = await post(placements, { complete: true, placements: [P("a")] }, "wrong");
assert.equal(r.status, 401);

// --- manifest hides removed placements (the stub cannot filter embedded rows,
// so just check the query asks for it and succeeds)
await send([P("a"), P("b")]);
const aId = db.placements.find((p) => p.external_id === "a").id;
db.assignments.push({ placements: { external_id: "a" }, creatives: { id: "c1", storage_path: "x.png", status: "approved" }, owner_id: "o1", active: true, crop_zoom: 2, crop_x: 0.25, crop_y: 0.6 });
const getManifest = async () => {
  const res = await manifest.GET(new Request("https://x/v1/manifest", { headers: { "x-deusads-key": GAME.api_key } }));
  return { status: res.status, body: await res.json() };
};
r = await getManifest();
assert.equal(r.status, 200);
assert.deepEqual(r.body.placements[0].crop, { zoom: 2, x: 0.25, y: 0.6 }, "manifest carries the crop");

// --- crop columns not migrated yet: the default fit, not an error
cropMissing = true;
r = await getManifest();
assert.equal(r.status, 200);
assert.deepEqual(r.body.placements[0].crop, { zoom: 1, x: 0.5, y: 0.5 });
cropMissing = false;

// --- a bad value in the row never reaches the SDK
db.assignments[0].crop_zoom = 40;
db.assignments[0].crop_x = -3;
r = await getManifest();
assert.deepEqual(r.body.placements[0].crop, { zoom: 8, x: 0, y: 0.6 });

// --- targeting (migration 0018): a booked creative shows only in a game that fits it
{
  const booked = (creativeId, advertiserId, targeting) => ({
    placements: { external_id: "a" },
    creatives: {
      id: creativeId,
      storage_path: `${creativeId}.png`,
      status: "approved",
      owner_id: advertiserId,
      ...(targeting === undefined ? {} : { targeting }),
    },
    owner_id: "o1",
    active: true,
    source: "booking",
  });
  const base = db.assignments.length;
  const shownOnA = async () => (await getManifest()).body.placements.find((p) => p.id === "a")?.creativeId;
  const only = (...rows) => {
    db.assignments.length = base;
    db.assignments.push(...rows);
  };
  const GAME_GENRES = GAME.genres;

  // the developer's own creative is the fallback: c1 is on placement "a" already
  assert.equal(await shownOnA(), "c1");

  // fits: genre shooter is one of the game's
  only(booked("fits", "adv1", { genres: ["horror", "shooter"] }));
  assert.equal(await shownOnA(), "fits", "a booking that fits beats the developer's own creative");

  // does not fit: falls back to the developer's creative, the placement is never empty
  only(booked("miss", "adv1", { genres: ["horror"] }));
  assert.equal(await shownOnA(), "c1");
  only(booked("miss", "adv1", { languages: ["de"] }));
  assert.equal(await shownOnA(), "c1", "one language the game does not have");
  only(booked("miss", "adv1", { genres: ["shooter"], platforms: ["pico"] }));
  assert.equal(await shownOnA(), "c1", "between fields: every one must fit");
  only(booked("both", "adv1", { genres: ["shooter"], platforms: ["quest"], languages: ["ru"] }));
  assert.equal(await shownOnA(), "both");
  only(booked("excluded", "adv1", { exclude_genres: ["social"] }));
  assert.equal(await shownOnA(), "c1", "an excluded genre the game has");
  only(booked("not-excluded", "adv1", { exclude_genres: ["horror"] }));
  assert.equal(await shownOnA(), "not-excluded");

  // no audience: shown everywhere
  only(booked("plain", "adv1"));
  assert.equal(await shownOnA(), "plain");
  only(booked("null", "adv1", null));
  assert.equal(await shownOnA(), "null");

  // the rotation only sees creatives that fit: advertiser B does not fit, so A is always chosen
  only(booked("a-fits", "advA", { genres: ["shooter"] }), booked("b-miss", "advB", { genres: ["puzzle"] }), booked("b-miss2", "advB", { languages: ["ja"] }));
  for (let i = 0; i < 30; i++) assert.equal(await shownOnA(), "a-fits");

  // strict: a game that filled in nothing gets no targeted creative, but still gets plain ones
  GAME.genres = [];
  only(booked("targeted", "adv1", { genres: ["shooter"] }));
  assert.equal(await shownOnA(), "c1", "genres not filled in: a creative asking for a genre does not show");
  only(booked("excluding", "adv1", { exclude_genres: ["horror"] }));
  assert.equal(await shownOnA(), "c1", "excluding a genre also needs the game's genres");
  only(booked("targeted", "adv1", { languages: ["en"] }));
  assert.equal(await shownOnA(), "targeted", "other fields are unaffected by an empty genre list");
  only(booked("targeted", "adv1", { genres: ["shooter"] }), booked("plain", "adv2"));
  assert.equal(await shownOnA(), "plain");
  GAME.genres = GAME_GENRES;

  // the game's description is read only when a booked creative has an audience
  only(booked("plain", "adv1"), booked("null", "adv2", null));
  const reads = profileReads;
  await getManifest();
  assert.equal(profileReads, reads, "no audience in play: no extra query");
  only(booked("fits", "adv1", { genres: ["shooter"] }));
  await getManifest();
  assert.equal(profileReads, reads + 1);

  // the developer's own creative is never filtered, whatever its audience says
  only();
  db.assignments[0].creatives.targeting = { genres: ["horror"] };
  assert.equal(await shownOnA(), "c1");
  delete db.assignments[0].creatives.targeting;

  // database without 0018: no audience can exist yet, so nothing is filtered and nothing breaks
  targetingMissing = true;
  only(booked("miss", "adv1", { genres: ["horror"] }));
  r = await getManifest();
  assert.equal(r.status, 200);
  assert.equal(r.body.placements.find((p) => p.id === "a")?.creativeId, "miss", "the old behaviour: it is served");
  targetingMissing = false;

  // the unreadable profile (the audience is there, the game cannot be read): fail closed
  only(booked("fits", "adv1", { genres: ["shooter"] }));
  GAME.genres = undefined;
  assert.equal(await shownOnA(), "c1", "a game without a description gets no targeted creative");
  GAME.genres = GAME_GENRES;

  db.assignments.length = base;
}

// --- CORS: WebGL builds call the API from another origin
for (const handler of [manifest, events]) {
  const res = await handler.OPTIONS(new Request("https://x/v1", { method: "OPTIONS" }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-headers"), /X-DeusADS-Key/i);
}
{
  const res = await manifest.GET(new Request("https://x/v1/manifest", { headers: { "x-deusads-key": GAME.api_key } }));
  assert.equal(res.headers.get("access-control-allow-origin"), "*", "success responses carry CORS");
  const bad = await manifest.GET(new Request("https://x/v1/manifest", { headers: { "x-deusads-key": "wrong" } }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("access-control-allow-origin"), "*", "errors stay readable from the browser");
}

// --- a transient failure of the key lookup is retried once
gamesFailures = 1;
r = await getManifest();
assert.equal(r.status, 200, "one hiccup is absorbed");
gamesFailures = 2;
r = await getManifest();
assert.equal(r.status, 503, "a real outage is still reported");
gamesFailures = 0;

// --- impressions: every view counts, retries do not
const imp = (eventId, extra = {}) => ({ eventId, placementId: "a", creativeId: "11111111-1111-4111-8111-111111111111", timestamp: 1700000000, visibleSeconds: 1.2, ...extra });
const sendEvents = async (list, sessionId = "s1") => (await post(events, { sessionId, sdkVersion: "0.4.0", impressions: list })).json();

r = await sendEvents([imp("e1"), imp("e2")]);
assert.equal(r.accepted, 2);
r = await sendEvents([imp("e2"), imp("e3")]); // e2 retried
assert.equal(r.accepted, 1); assert.equal(r.duplicates, 1);
assert.equal(db.impressions.length, 3);
assert.ok(db.impressions.every((i) => i.placement_id === aId));

// old SDK without eventId: one per placement per session, as before
r = await sendEvents([imp(undefined), imp(undefined)], "old");
assert.equal(r.accepted, 1);
r = await sendEvents([imp(undefined, { placementId: "nope" })], "old");
assert.equal(r.unknownPlacements, 1);

// one out-of-range value must not sink the batch (visible_seconds is numeric(6,2))
r = await sendEvents(
  [imp("big", { visibleSeconds: 1e9 }), imp("neg", { visibleSeconds: -5 }), imp("frac", { visibleSeconds: 2.3456 })],
  "clamp"
);
assert.equal(r.accepted, 3);
const secondsOf = (id) => db.impressions.find((i) => i.event_id === id).visible_seconds;
assert.equal(secondsOf("big"), 9999.99);
assert.equal(secondsOf("neg"), 0);
assert.equal(secondsOf("frac"), 2.35);

// views of the developer's own creatives are marked; the rest are not
const OWN = "22222222-2222-4222-8222-222222222222";
db.creatives.push({ id: OWN, kind: "own" }, { id: "11111111-1111-4111-8111-111111111111", kind: "campaign" });
r = await sendEvents([imp("o1", { creativeId: OWN }), imp("o2")], "own1");
assert.equal(r.accepted, 2);
assert.equal(db.impressions.find((i) => i.event_id === "o1").own, true);
assert.equal(db.impressions.find((i) => i.event_id === "o2").own, false);
db.creatives.length = 0;

// the anonymous install ID (SDK 0.9+) is kept when it looks like one and ignored otherwise; the views count either way
const sendFrom = async (list, sessionId, installId) => (await post(events, { sessionId, installId, sdkVersion: "0.9.0", impressions: list })).json();
const INSTALL = "0123456789abcdef0123456789abcdef";
r = await sendFrom([imp("i1")], "inst1", INSTALL);
assert.equal(r.accepted, 1);
assert.equal(db.impressions.find((i) => i.event_id === "i1").install_id, INSTALL);
for (const [label, bad] of [["i2", "bad id!"], ["i3", 42], ["i4", "x".repeat(80)], ["i5", ""], ["i6", undefined]]) {
  r = await sendFrom([imp(label)], "inst-" + label, bad);
  assert.equal(r.accepted, 1, "a bad install ID never sinks the batch");
  assert.equal(db.impressions.find((i) => i.event_id === label).install_id, undefined, "and is not stored");
}

// --- visibility and attention (migration 0035): how each view was seen, and the chances to be seen
{
  const UUID = "11111111-1111-4111-8111-111111111111";
  const batch = async (body) => (await post(events, { sessionId: "att1", installId: INSTALL, sdkVersion: "0.11.0", impressions: [], ...body })).json();
  const row = (id) => db.impressions.find((i) => i.event_id === id);

  // a measured view keeps its length and the three averages, rounded to what the columns hold
  r = await batch({ impressions: [imp("m1", { visibleSeconds: 7.5, distance: 2.3, screenFraction: 0.1234567, angle: 33.33 })] });
  assert.equal(r.accepted, 1);
  assert.equal(row("m1").visible_seconds, 7.5);
  assert.equal(row("m1").view_distance, 2.3);
  assert.equal(row("m1").screen_fraction, 0.1235);
  assert.equal(row("m1").view_angle, 33.3);

  // a view from an SDK before 0.11 is never taken for a measured one
  r = await batch({ impressions: [imp("m2"), imp("m3", { distance: 0 }), imp("m4", { distance: "far" })] });
  assert.equal(r.accepted, 3);
  for (const id of ["m2", "m3", "m4"]) assert.equal(row(id).view_distance, undefined, id);

  // values out of range are pulled in; they never sink the batch
  r = await batch({ impressions: [imp("m5", { distance: 1e9, screenFraction: 5, angle: 500 }), imp("m6", { distance: 1, screenFraction: -1, angle: -3 })] });
  assert.equal(r.accepted, 2);
  assert.equal(row("m5").view_distance, 99999);
  assert.equal(row("m5").screen_fraction, 1);
  assert.equal(row("m5").view_angle, 180);
  assert.equal(row("m6").screen_fraction, 0);
  assert.equal(row("m6").view_angle, 0);

  // before the table exists the opportunities are ignored and the views still count
  const chance = (eventId, extra = {}) => ({ eventId, placementId: "a", creativeId: UUID, timestamp: 1700000000, count: 3, ...extra });
  r = await batch({ impressions: [imp("m7", { distance: 2 })], opportunities: [chance("op0")] });
  assert.equal(r.accepted, 1);
  assert.equal(r.opportunities, 0);

  db.ad_opportunities = [];
  r = await batch({ opportunities: [chance("op1"), chance("op2", { count: 99999 })] });
  assert.equal(r.accepted, 0);
  assert.equal(r.opportunities, 2, "a batch of only chances is taken");
  assert.equal(db.ad_opportunities.length, 2);
  const stored = db.ad_opportunities.find((o) => o.event_id === "op1");
  assert.equal(stored.game_id, GAME.id);
  assert.equal(stored.owner_id, GAME.owner_id);
  assert.equal(stored.placement_id, aId);
  assert.equal(stored.session_id, "att1");
  assert.equal(stored.install_id, INSTALL);
  assert.equal(stored.opportunities, 3);
  assert.equal(stored.own, false);
  assert.equal(stored.occurred_at, new Date(1700000000 * 1000).toISOString());
  assert.equal(db.ad_opportunities.find((o) => o.event_id === "op2").opportunities, 10000, "a huge count is capped");

  // a retried upload changes nothing; rows that cannot be placed or counted are skipped
  r = await batch({ opportunities: [chance("op1"), chance("bad1", { placementId: "nope" }), chance("bad2", { count: 0 }), chance(undefined), chance("bad3", { count: "x" })] });
  assert.equal(r.opportunities, 0);
  assert.equal(db.ad_opportunities.length, 2);

  // chances of the developer's own creatives are marked
  db.creatives.push({ id: OWN, kind: "own" });
  r = await batch({ opportunities: [chance("own1", { creativeId: OWN })] });
  assert.equal(r.opportunities, 1);
  assert.equal(db.ad_opportunities.find((o) => o.event_id === "own1").own, true);
  db.creatives.length = 0;

  // 0034 in but 0035 not: the view counts, only the three figures are left out
  attentionMissing = true;
  r = await batch({ impressions: [imp("m8", { distance: 2, screenFraction: 0.2, angle: 10 })] });
  attentionMissing = false;
  assert.equal(r.accepted, 1);
  assert.equal(row("m8").view_distance, undefined);
  assert.equal(row("m8").visible_seconds, 1.2);

  delete db.ad_opportunities;
}

// --- interactions (migration 0036): placements marked Interactive, touches during a view
{
  const sync = async (list) => send(list, false);

  r = await sync([{ ...P("touch1"), interactive: true }, P("touch2")]);
  assert.equal(r.status, 200);
  assert.equal(db.placements.find((p) => p.external_id === "touch1").interactive, true);
  assert.equal(db.placements.find((p) => p.external_id === "touch2").interactive, false, "not marked, not interactive");

  // an SDK before 0.11 sends no flag: the placement is simply not interactive
  r = await sync([P("touch1")]);
  assert.equal(db.placements.find((p) => p.external_id === "touch1").interactive, false);

  // 0036 not applied: the placements still save, without the flag
  interactionsMissing = true;
  r = await sync([{ ...P("touch3"), interactive: true }]);
  interactionsMissing = false;
  assert.equal(r.status, 200);
  assert.ok(db.placements.find((p) => p.external_id === "touch3"), "saved without the flag");
  assert.equal(db.placements.find((p) => p.external_id === "touch3").interactive, undefined);

  const viewsWith = (list) => post(events, { sessionId: "itx1", installId: INSTALL, sdkVersion: "0.11.0", impressions: list }).then((res) => res.json());
  const view = (id) => db.impressions.find((i) => i.event_id === id);

  r = await viewsWith([
    imp("t1", { distance: 1, screenFraction: 0.1, angle: 5, interactions: 3 }),
    imp("t2", { distance: 1, interactions: 99999 }),
    imp("t3", { distance: 1, interactions: -4 }),
    imp("t4", { distance: 1, interactions: "x" }),
    imp("t5", { interactions: 2 }),
  ]);
  assert.equal(r.accepted, 5);
  assert.equal(view("t1").interactions, 3);
  assert.equal(view("t2").interactions, 1000, "capped");
  assert.equal(view("t3").interactions, 0);
  assert.equal(view("t4").interactions, 0);
  assert.equal(view("t5").interactions, undefined, "a view with no measurement is not a measured view");

  // 0035 in, 0036 not: the view and its attention figures still count, only the touches are left out
  interactionsMissing = true;
  r = await viewsWith([imp("t6", { distance: 2, screenFraction: 0.2, angle: 10, interactions: 4 })]);
  interactionsMissing = false;
  assert.equal(r.accepted, 1);
  assert.equal(view("t6").view_distance, 2);
  assert.equal(view("t6").interactions, undefined);
}

// --- placement organisation (migration 0021): places, switches, views per place
{
  const baseline = live().map((id) => P(id));
  const shared = (places) => ({ ...P("s1"), shared: true, places });
  const unique = { ...P("u1"), shared: false, places: [{ scene: "MainMenu", path: "Banner" }] };

  // before the tables exist: the placements are saved, the places are skipped, nothing fails
  r = await send([...baseline, shared([{ scene: "Level_3", path: "Wall/A" }]), unique], false);
  assert.equal(r.status, 200);
  assert.equal(r.body.places, undefined, "no places reported while the database is behind");
  assert.ok(db.placements.find((p) => p.external_id === "s1"));

  organizationApplied = true;
  const twoCopies = [{ scene: "Level_3", path: "Wall/A" }, { scene: "Level_5", path: "Wall/B" }];
  r = await send([...baseline, shared(twoCopies), unique], false);
  assert.equal(r.status, 200);
  assert.equal(r.body.places, 3, "two copies of the shared placement and the unique one");
  assert.equal(organization.placement_places.length, 3);
  assert.equal(db.placements.find((p) => p.external_id === "s1").shared, true);
  assert.equal(db.placements.find((p) => p.external_id === "u1").shared, false);
  assert.equal(db.placements.find((p) => p.external_id === "u1").place_type_suggested, "menu");
  assert.equal(db.placements.find((p) => p.external_id === "s1").place_type_suggested, "gameplay");
  assert.equal(db.placements.find((p) => p.external_id === "s1").scene, "Level_3", "the old single-scene field stays filled");

  // sending the same list again changes nothing
  r = await send([...baseline, shared(twoCopies), unique], false);
  assert.equal(organization.placement_places.length, 3);

  // switches: nothing is off to begin with
  db.assignments.push({ placements: { external_id: "u1" }, creatives: { id: "c2", storage_path: "y.png", status: "approved" }, owner_id: "o1", active: true });
  r = await getManifest();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.disabled, []);
  assert.deepEqual(r.body.disabledScenes, []);
  assert.ok(r.body.placements.find((p) => p.id === "u1"));

  // a placement switched off: no creative, and the SDK is told to hide it
  db.placements.find((p) => p.external_id === "u1").enabled = false;
  r = await getManifest();
  assert.deepEqual(r.body.disabled, ["u1"]);
  assert.ok(!r.body.placements.find((p) => p.id === "u1"), "an off placement gets no creative");
  assert.ok(r.body.placements.find((p) => p.id === "a"), "the others are untouched");

  // a folder switched off covers what is in it, including placements put there later
  organization.placement_folders.push({ id: "f1", game_id: GAME.id, enabled: false });
  db.placements.find((p) => p.external_id === "s1").folder_id = "f1";
  r = await getManifest();
  assert.deepEqual(r.body.disabled, ["s1", "u1"]);

  // switching the folder back on does not bring back what is off by itself
  organization.placement_folders[0].enabled = true;
  r = await getManifest();
  assert.deepEqual(r.body.disabled, ["u1"]);

  // a scene switched off is sent by name
  organization.placement_scene_off.push({ game_id: GAME.id, scene: "Level_3" });
  r = await getManifest();
  assert.deepEqual(r.body.disabledScenes, ["Level_3"]);
  organization.placement_scene_off.length = 0;
  db.placements.find((p) => p.external_id === "u1").enabled = true;
  db.assignments.pop();

  // views come with the place they were seen at
  const placeOf = (scene, path) =>
    organization.placement_places.find((x) => x.scene === scene && x.path === path).id;
  r = await sendEvents([
    imp("pl1", { placementId: "s1", scene: "Level_5", path: "Wall/B" }),
    imp("pl2", { placementId: "s1", scene: "Level_3", path: "Wall/A" }),
    imp("pl3", { placementId: "s1", scene: "Elsewhere", path: "Nowhere" }),
    imp("pl4", { placementId: "s1" }),
  ], "places");
  assert.equal(r.accepted, 4, "a view at an unknown place still counts");
  const viewOf = (eventId) => db.impressions.find((i) => i.event_id === eventId);
  assert.equal(viewOf("pl1").place_id, placeOf("Level_5", "Wall/B"));
  assert.equal(viewOf("pl2").place_id, placeOf("Level_3", "Wall/A"));
  assert.equal(viewOf("pl3").place_id ?? null, null);
  assert.equal(viewOf("pl4").place_id ?? null, null);

  // a complete list removes the copies that are gone from a placement that reported places
  r = await send([...baseline, shared([{ scene: "Level_3", path: "Wall/A" }]), unique], true);
  assert.equal(r.status, 200);
  const removedAt = (scene, path) => organization.placement_places.find((x) => x.scene === scene && x.path === path).removed_at;
  assert.ok(removedAt("Level_5", "Wall/B"), "the copy that is gone is marked removed");
  assert.equal(removedAt("Level_3", "Wall/A"), null);
  assert.equal(removedAt("MainMenu", "Banner"), null);

  // a copy that comes back is restored
  r = await send([...baseline, shared(twoCopies), unique], true);
  assert.equal(removedAt("Level_5", "Wall/B"), null);

  // a placement that is gone takes its places with it; one that reports no places keeps its own
  r = await send([...baseline, shared(twoCopies)], true);
  assert.ok(removedAt("MainMenu", "Banner"), "places of a removed placement are removed");
  assert.equal(removedAt("Level_3", "Wall/A"), null);
  r = await send([...baseline, P("s1"), unique], true);
  assert.equal(removedAt("Level_3", "Wall/A"), null, "an old SDK that sends no places does not wipe them");

  organizationApplied = false;
}

// --- picture shape (migration 0051): a place where the picture would be too distorted is left out
{
  organizationApplied = true;
  const baseline = live().map((id) => P(id));
  const shaped = (id, shapes) => ({
    ...P(id),
    shared: true,
    places: shapes.map((shape, index) => ({ scene: "Shape_" + index, path: "Wall/" + id, shape, worst: shape === 2 ? 4.7 : shape === 1 ? 1.8 : 1 })),
  });
  const placement = (id) => db.placements.find((p) => p.external_id === id);
  const placeRow = (id, index) => organization.placement_places.find((x) => x.placement_id === placement(id).id && x.scene === "Shape_" + index);
  db.assignments.push({ placements: { external_id: "w1" }, creatives: { id: "c9", storage_path: "w.png", status: "approved" }, owner_id: "o1", active: true });

  // every place too distorted: the placement is off for the game and gets no creative
  r = await send([...baseline, shaped("w1", [2, 2])], false);
  assert.equal(r.status, 200);
  assert.equal(placement("w1").shape_blocked, true);
  assert.equal(placeRow("w1", 0).shape_level, 2);
  assert.equal(placeRow("w1", 0).shape_worst, 4.7);
  r = await getManifest();
  assert.ok(r.body.disabled.includes("w1"), "a placement too distorted everywhere is listed as off");
  assert.ok(!r.body.placements.find((p) => p.id === "w1"), "and gets no creative");

  // only one copy too distorted: the placement stays in the rotation, the SDK leaves that copy out
  r = await send([...baseline, shaped("w1", [2, 0])], false);
  assert.equal(placement("w1").shape_blocked, false);
  assert.equal(placeRow("w1", 0).shape_level, 2);
  assert.equal(placeRow("w1", 1).shape_level, 0);
  r = await getManifest();
  assert.ok(!r.body.disabled.includes("w1"));
  assert.ok(r.body.placements.find((p) => p.id === "w1"), "the copy that is fine still gets its creative");

  // stretched is shown: recorded, never blocking
  r = await send([...baseline, shaped("w1", [1, 1])], false);
  assert.equal(placement("w1").shape_blocked, false);
  assert.equal(placeRow("w1", 0).shape_level, 1);

  // an invalid shape is ignored, and a report without shape (an older SDK) clears what was recorded
  r = await send([...baseline, { ...shaped("w1", [0, 0]), places: [{ scene: "Shape_0", path: "Wall/w1", shape: 9, worst: -3 }, { scene: "Shape_1", path: "Wall/w1" }] }], false);
  assert.equal(placement("w1").shape_blocked, false);
  assert.equal(placeRow("w1", 0).shape_level, 0);
  assert.equal(placeRow("w1", 0).shape_worst, null);

  // a copy listed twice counts with its worse shape
  r = await send([...baseline, { ...shaped("w1", [0]), places: [{ scene: "Shape_0", path: "Wall/w1", shape: 0 }, { scene: "Shape_0", path: "Wall/w1", shape: 2, worst: 3.2 }] }], false);
  assert.equal(placement("w1").shape_blocked, true);

  // 0051 not applied yet: placements and places are saved as before, nothing is blocked, the manifest answers
  shapeMissing = true;
  r = await send([...baseline, shaped("w2", [2, 2])], false);
  assert.equal(r.status, 200);
  assert.ok(placement("w2"));
  assert.equal(placement("w2").shape_blocked, undefined);
  assert.ok(organization.placement_places.find((x) => x.placement_id === placement("w2").id), "the places are still saved");
  r = await getManifest();
  assert.equal(r.status, 200);
  assert.ok(!r.body.disabled.includes("w2"));
  shapeMissing = false;

  db.assignments.pop();
  for (const id of ["w1", "w2"]) {
    const row = placement(id);
    organization.placement_places = organization.placement_places.filter((x) => x.placement_id !== row.id);
    db.placements.splice(db.placements.indexOf(row), 1);
  }
  organizationApplied = false;
}

// --- session starts (migration 0033): the SDK announces each session once
{
  const SESSION = "0123456789abcdef0123456789abcd01";
  const startedAt = Math.floor(Date.now() / 1000) - 60;
  const announce = async (body, key) => {
    const res = await post(sessions, body, key);
    return { status: res.status, body: await res.json() };
  };

  // before the table exists: the SDK is not sent into an error loop, and nothing is stored
  let s = await announce({ sessionId: SESSION, sdkVersion: "0.10.0", startedAt });
  assert.equal(s.status, 200);
  assert.equal(s.body.accepted, 0);

  db.game_sessions = [];
  s = await announce({ sessionId: SESSION, installId: INSTALL, sdkVersion: "0.10.0", startedAt });
  assert.equal(s.status, 200);
  assert.equal(s.body.accepted, 1);
  assert.equal(db.game_sessions.length, 1);
  const stored = db.game_sessions[0];
  assert.equal(stored.game_id, GAME.id);
  assert.equal(stored.owner_id, GAME.owner_id);
  assert.equal(stored.session_id, SESSION);
  assert.equal(stored.install_id, INSTALL);
  assert.equal(stored.sdk_version, "0.10.0");
  assert.equal(stored.started_at, new Date(startedAt * 1000).toISOString());

  // announcing the same session again (a retry) changes nothing
  s = await announce({ sessionId: SESSION, installId: INSTALL, sdkVersion: "0.10.0", startedAt });
  assert.equal(s.body.accepted, 0);
  assert.equal(s.body.duplicates, 1);
  assert.equal(db.game_sessions.length, 1);

  // a bad install ID never sinks the announcement; a clock far off is replaced by the time of the request
  s = await announce({ sessionId: "fedcba9876543210fedcba9876543210", installId: "bad id!", startedAt: 5 });
  assert.equal(s.body.accepted, 1);
  const second = db.game_sessions.find((row) => row.session_id === "fedcba9876543210fedcba9876543210");
  assert.equal(second.install_id, undefined);
  assert.ok(Math.abs(Date.parse(second.started_at) - Date.now()) < 60_000, "a clock far in the past is not trusted");

  // a session ID that cannot match an impression's is refused; a wrong key is refused
  for (const bad of [undefined, "", 42, "short", "x".repeat(80), "with space 123456"]) {
    s = await announce({ sessionId: bad, sdkVersion: "0.10.0" });
    assert.equal(s.status, 400, "bad session ID " + String(bad));
  }
  s = await announce({ sessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, "wrong-key");
  assert.equal(s.status, 401);
  assert.equal(db.game_sessions.length, 2);

  // player context (migration 0034): what the SDK says about the device, and the country from the request
  const announceWith = async (body, headers = {}) => {
    const res = await sessions.POST(
      new Request("https://x/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-deusads-key": GAME.api_key, ...headers },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: await res.json() };
  };
  s = await announceWith(
    { sessionId: "11111111111111111111111111111111", sdkVersion: "0.11.0", platform: "Android", deviceModel: "Oculus Quest 3", os: "Android OS 12 / API-32", language: "German", appVersion: "1.4.2" },
    { "x-vercel-ip-country": "de" }
  );
  assert.equal(s.body.accepted, 1);
  const withContext = db.game_sessions.find((row) => row.session_id === "11111111111111111111111111111111");
  assert.equal(withContext.platform, "quest");
  assert.equal(withContext.device_model, "Oculus Quest 3");
  assert.equal(withContext.os, "Android OS 12 / API-32");
  assert.equal(withContext.language, "German");
  assert.equal(withContext.app_version, "1.4.2");
  assert.equal(withContext.country, "DE");
  assert.ok(!JSON.stringify(withContext).includes("x-vercel"), "no request header is stored");

  // an old SDK sends no context: the session is still counted, with nothing made up
  s = await announceWith({ sessionId: "22222222222222222222222222222222", sdkVersion: "0.10.0" });
  assert.equal(s.body.accepted, 1);
  const bare = db.game_sessions.find((row) => row.session_id === "22222222222222222222222222222222");
  assert.equal(bare.platform, undefined);
  assert.equal(bare.country, undefined);

  // a database without 0034 still counts the session
  contextMissing = true;
  s = await announceWith({ sessionId: "33333333333333333333333333333333", platform: "WindowsPlayer", deviceModel: "PC" }, { "x-vercel-ip-country": "US" });
  contextMissing = false;
  assert.equal(s.status, 200);
  assert.equal(s.body.accepted, 1);
  const plain = db.game_sessions.find((row) => row.session_id === "33333333333333333333333333333333");
  assert.equal(plain.country, undefined);

  delete db.game_sessions;
}

// --- fill rate (migration 0037): every manifest request says what each placement got
{
  const savedAssignments = db.assignments.splice(0);
  const wasOrganized = organizationApplied;
  const own = { placements: { external_id: "a" }, creatives: { id: "c1", storage_path: "x.png", status: "approved", owner_id: "o1" }, owner_id: "o1", active: true };
  const booked = (targeting) => ({ placements: { external_id: "a" }, creatives: { id: "bk", storage_path: "bk.png", status: "approved", owner_id: "adv1", ...(targeting ? { targeting } : {}) }, owner_id: "o1", active: true, source: "booking" });
  const lastFill = () => fillLog[fillLog.length - 1]?.p_slots;
  const slots = live();
  assert.ok(slots.includes("a") && slots.length > 1, "the game has several live placements");

  // nothing assigned anywhere: every slot is empty, none is invented
  fillLog.length = 0;
  r = await getManifest();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.placements, []);
  assert.equal(fillLog.length, 1, "one request, one record");
  assert.equal(fillLog[0].p_game_id, GAME.id);
  assert.equal(fillLog[0].p_owner, GAME.owner_id);
  assert.deepEqual(Object.keys(lastFill()).sort(), slots, "every live placement is a slot");
  assert.ok(Object.values(lastFill()).every((state) => state === "no_ad"));

  // the developer's own creative fills its slot; the others stay empty
  db.assignments.push(own);
  await getManifest();
  assert.equal(lastFill().a, "own");
  assert.equal(lastFill()[slots.find((id) => id !== "a")], "no_ad");

  // an advertiser's ad that fits wins the slot
  db.assignments.length = 0;
  db.assignments.push(booked({ genres: ["shooter"] }), own);
  await getManifest();
  assert.equal(lastFill().a, "ad");

  // an ad that asks for another kind of game: the developer's creative fills in, so the slot is not empty
  db.assignments.length = 0;
  db.assignments.push(booked({ genres: ["horror"] }), own);
  await getManifest();
  assert.equal(lastFill().a, "own");

  // the same without a creative of the developer's own: empty, and the reason is the audience
  db.assignments.length = 0;
  db.assignments.push(booked({ genres: ["horror"] }));
  r = await getManifest();
  assert.equal(r.body.placements.length, 0);
  assert.equal(lastFill().a, "targeting");

  // what the developer switched off is not a slot
  organizationApplied = true;
  const bPlacement = db.placements.find((p) => p.external_id === "b");
  bPlacement.enabled = false;
  await getManifest();
  assert.ok(!("b" in lastFill()), "a switched-off placement is not counted");
  assert.ok("a" in lastFill());
  delete bPlacement.enabled;
  organizationApplied = wasOrganized;

  // 0037 not applied: the manifest is served as ever, nothing is recorded
  fillMissing = true;
  fillLog.length = 0;
  db.assignments.length = 0;
  db.assignments.push(own);
  r = await getManifest();
  fillMissing = false;
  assert.equal(r.status, 200);
  assert.equal(r.body.placements.length, 1);
  assert.equal(fillLog.length, 0);

  db.assignments.length = 0;
  db.assignments.push(...savedAssignments);
}

// --- the manifest does not wait for its bookkeeping: the SDK-signal stamp, the booking schedule and the
// fill rate are left for after the answer (in a real request `after` runs them once the response is out)
{
  const savedAssignments = db.assignments.splice(0);
  db.assignments.push({ placements: { external_id: "a" }, creatives: { id: "c1", storage_path: "x.png", status: "approved", owner_id: "o1" }, owner_id: "o1", active: true });
  fillLog.length = 0;
  globalThis.__afterTasks = [];
  r = await getManifest();
  const waiting = globalThis.__afterTasks;
  globalThis.__afterTasks = undefined;
  assert.equal(r.status, 200);
  assert.equal(r.body.placements.length, 1, "the answer is complete without the bookkeeping");
  assert.equal(fillLog.length, 0, "the fill rate is not recorded before the answer has gone out");
  assert.equal(waiting.length, 3, "stamp, booking schedule and fill rate wait for after the answer");
  for (const task of waiting) await task();
  assert.equal(fillLog.length, 1, "and are done once it has");
  db.assignments.length = 0;
  db.assignments.push(...savedAssignments);
}

// --- SDK performance (migration 0038): the report rides along with the batch, or goes alone
{
  const alone = (performance, extra = {}) => post(events, { sessionId: "perf1", sdkVersion: "0.11.0", impressions: [], performance, ...extra }).then((res) => res.json());
  const sdkReport = { frames: 3600, seconds: 50, slowFrames: 40, hitches: 3, worstMs: 150.26, adFrames: 1800, adSeconds: 25, adSlowFrames: 30, loads: 2, loadMs: 900, loadMsMax: 600, cachedLoads: 1, cachedMs: 20, manifestLoads: 1, manifestMs: 300, uploadFailed: 1 };

  // a report with nothing else in the batch is stored
  perfLog.length = 0;
  r = await alone(sdkReport);
  assert.equal(r.accepted, 0);
  assert.equal(perfLog.length, 1);
  assert.equal(perfLog[0].p_game_id, GAME.id);
  assert.equal(perfLog[0].p_owner, GAME.owner_id);
  assert.equal(perfLog[0].p_session, "perf1");
  assert.deepEqual(perfLog[0].p_perf, {
    frames: 3600, seconds: 50, slow_frames: 40, hitches: 3, worst_ms: 150.3,
    ad_frames: 1800, ad_seconds: 25, ad_slow_frames: 30,
    loads: 2, load_ms: 900, load_ms_max: 600, cached_loads: 1, cached_ms: 20, manifest_loads: 1, manifest_ms: 300,
    manifest_failed: 0, manifest_cached: 0, creative_failed: 0, creative_invalid: 0, upload_failed: 1,
  });

  // the SDK always sends the object, all zeros when it has nothing to say; that and anything unusable is not stored
  perfLog.length = 0;
  const zeros = Object.fromEntries(Object.keys(sdkReport).map((key) => [key, 0]));
  await alone(zeros);
  await alone(undefined);
  await alone("not an object");
  await alone({ frames: "x", seconds: {}, slowFrames: null, loads: -4 });
  assert.equal(perfLog.length, 0);

  // values are pulled in, and a part is never bigger than its whole
  await alone({ frames: 100, seconds: 1e9, slowFrames: 500, hitches: 900, worstMs: -3, adFrames: 1000, adSeconds: 5000, adSlowFrames: 400 });
  assert.deepEqual(
    { ...perfLog[0].p_perf },
    { ...perfLog[0].p_perf, frames: 100, seconds: 86400, slow_frames: 100, hitches: 100, worst_ms: 0, ad_frames: 100, ad_seconds: 5000, ad_slow_frames: 100 }
  );

  // seconds, ms and counts of something that did not happen are dropped
  perfLog.length = 0;
  await alone({ frames: 0, seconds: 99, loads: 0, loadMs: 500, loadMsMax: 500, creativeFailed: 2 });
  assert.equal(perfLog[0].p_perf.seconds, 0);
  assert.equal(perfLog[0].p_perf.load_ms, 0);
  assert.equal(perfLog[0].p_perf.creative_failed, 2);

  // with views in the same batch both are stored
  perfLog.length = 0;
  r = await post(events, { sessionId: "perf2", sdkVersion: "0.11.0", impressions: [imp("perf-e1")], performance: sdkReport }).then((res) => res.json());
  assert.equal(r.accepted, 1);
  assert.equal(perfLog.length, 1);
  assert.equal(perfLog[0].p_session, "perf2");

  // 0038 not applied: the views still count, the report is left out
  perfMissing = true;
  r = await post(events, { sessionId: "perf3", sdkVersion: "0.11.0", impressions: [imp("perf-e2")], performance: sdkReport }).then((res) => res.json());
  assert.equal(r.accepted, 1);
  r = await alone(sdkReport);
  assert.equal(r.accepted, 0);
  perfMissing = false;
  assert.equal(perfLog.length, 1);

  // an old SDK sends none
  r = await post(events, { sessionId: "perf4", sdkVersion: "0.10.0", impressions: [imp("perf-e3")] }).then((res) => res.json());
  assert.equal(r.accepted, 1);
  assert.equal(perfLog.length, 1);
}

// --- database not migrated yet: routes keep working the old way
outdated = true;
r = await send([P("a"), P("z")]);
assert.equal(r.status, 200); assert.ok(r.body.warning);
assert.ok(db.placements.find((p) => p.external_id === "z"));
assert.ok(!db.placements.find((p) => p.external_id === "b").removed_at, "no removal without the column");
r = await sendEvents([imp("e9")], "s2");
assert.equal(r.accepted, 1);
r = await getManifest();
assert.equal(r.status, 200);
assert.deepEqual(r.body.placements[0].crop, { zoom: 1, x: 0.5, y: 0.5 });

console.log("routes: all checks passed");
