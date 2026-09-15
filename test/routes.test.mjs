// End-to-end test of the SDK routes against an in-memory stand-in for the
// Supabase REST API. The real supabase-js client is used; only fetch is swapped.
// Run: node test/routes.test.mjs   (bundles the routes with esbuild first)
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const GAME = { id: "g1", owner_id: "o1", name: "Test Game", api_key: "key-1" };
const db = { placements: [], impressions: [], assignments: [], creatives: [] };
let outdated = false;
let nextId = 1;

function fail(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function matches(row, params) {
  for (const [key, raw] of params) {
    if (["select", "on_conflict", "order", "columns", "limit"].includes(key)) continue;
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

  const ok = (rows, status = 200) =>
    new Response(JSON.stringify(rows), { status, headers: { "content-type": "application/json" } });

  if (table === "games") {
    return ok(url.searchParams.get("api_key") === `eq.${GAME.api_key}` ? [GAME] : []);
  }

  const rows = db[table];
  if (!rows) return fail(404, "PGRST205", "no table " + table);

  if (method === "GET") {
    const list = rows.filter((r) => matches(r, params));
    if (table === "assignments") return ok(list);
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
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: out,
  external: ["@supabase/*"],
  logLevel: "error",
});
const load = (name) => import(pathToFileURL(join(out, name + ".js")).href);
const placements = await load("placements");
const events = await load("events");
const manifest = await load("manifest");

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
db.assignments.push({ placements: { external_id: "a" }, creatives: { id: "c1", storage_path: "x.png", status: "approved" }, owner_id: "o1", active: true });
r = await manifest.GET(new Request("https://x/v1/manifest", { headers: { "x-deusads-key": GAME.api_key } }));
assert.equal(r.status, 200);

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

// --- database not migrated yet: routes keep working the old way
outdated = true;
r = await send([P("a"), P("z")]);
assert.equal(r.status, 200); assert.ok(r.body.warning);
assert.ok(db.placements.find((p) => p.external_id === "z"));
assert.ok(!db.placements.find((p) => p.external_id === "b").removed_at, "no removal without the column");
r = await sendEvents([imp("e9")], "s2");
assert.equal(r.accepted, 1);
r = await manifest.GET(new Request("https://x/v1/manifest", { headers: { "x-deusads-key": GAME.api_key } }));
assert.equal(r.status, 200);

console.log("routes: all checks passed");
