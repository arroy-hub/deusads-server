// The keep-alive route: reads a few tables, answers 200 when the database does and 503 when it does not,
// and answers repeated calls within a minute without asking the database again.
// Run: node test/keepalive.test.mjs   (bundles the route with esbuild first)
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const asked = []; // "<method> <table>" of every request that reached the stand-in database
let broken = false;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  asked.push(`${method} ${url.pathname.replace("/rest/v1/", "")}`);
  if (broken) {
    return new Response(JSON.stringify({ code: "XX000", message: "down" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify([{ id: "1" }]), { status: 200, headers: { "content-type": "application/json" } });
};

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

const out = join(process.cwd(), "node_modules", ".cache", "deusads-keepalive-test");
mkdirSync(out, { recursive: true });
async function load() {
  await build({
    entryPoints: { keepalive: "app/v1/keepalive/route.js" },
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: out,
    external: ["@supabase/*", "sharp"],
    alias: { "next/server": join(process.cwd(), "test", "stubs", "next-server.mjs") },
    logLevel: "error",
  });
  // A fresh copy each time, so the one-minute memory of the route starts empty.
  return import(pathToFileURL(join(out, "keepalive.js")).href + "?" + Math.random());
}
const call = async (route) => {
  const res = await route.GET(new Request("https://x/v1/keepalive"));
  return { status: res.status, body: await res.json() };
};

// 1. Healthy database: 200, and real reads on three different tables, nothing written.
{
  const route = await load();
  const res = await call(route);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(asked.slice().sort(), ["GET accounts", "GET campaigns", "GET games"]);
  assert.ok(Number.isFinite(Date.parse(res.body.checkedAt)));
  assert.deepEqual(Object.keys(res.body).sort(), ["checkedAt", "ok"], "nothing but the verdict is exposed");
  console.log("ok: reads three tables and answers 200");

  // 2. A second call within the minute does not ask the database again.
  asked.length = 0;
  const again = await call(route);
  assert.equal(again.status, 200);
  assert.equal(asked.length, 0);
  console.log("ok: repeated calls are answered without a query");
}

// 3. A database that fails: 503, so a scheduled caller sees the failure.
{
  asked.length = 0;
  broken = true;
  const route = await load();
  const res = await call(route);
  assert.equal(res.status, 503);
  assert.equal(res.body.ok, false);
  assert.ok(asked.length >= 1);
  console.log("ok: a failing database answers 503");

  // 4. The failure is not remembered: once the database is back, the next call is 200.
  broken = false;
  const back = await call(route);
  assert.equal(back.status, 200);
  console.log("ok: recovers on the next call");
}

console.log("keepalive tests passed");
