import assert from "node:assert/strict";
import { DIMENSION_IDS, audienceTable, countryFrom, loadAudience, playerContext, platformFamily, valueLabel } from "../lib/audience.js";

// platform families: a Quest is an Android build on a Quest device
assert.equal(platformFamily("Android", "Oculus Quest 3"), "quest");
assert.equal(platformFamily("Android", "Meta Quest Pro"), "quest");
assert.equal(platformFamily("Android", "Pico Neo 4"), "pico");
assert.equal(platformFamily("Android", "HTC VIVE Focus 3"), "vive");
assert.equal(platformFamily("Android", "Pixel 8"), "android");
assert.equal(platformFamily("WindowsPlayer", "PC"), "windows");
assert.equal(platformFamily("OSXPlayer", ""), "mac");
assert.equal(platformFamily("IPhonePlayer", ""), "ios");
assert.equal(platformFamily("WebGLPlayer", ""), "webgl");
assert.equal(platformFamily("WindowsEditor", "PC"), "editor");
assert.equal(platformFamily("PS5", ""), "other");
assert.equal(platformFamily("", ""), null);
assert.equal(platformFamily(undefined, undefined), null);
assert.equal(platformFamily(42, null), null);

// country comes from the request header only, as two capital letters
const headers = (value) => new Headers(value ? { "x-vercel-ip-country": value } : {});
assert.equal(countryFrom(headers("de")), "DE");
assert.equal(countryFrom(headers("US")), "US");
assert.equal(countryFrom(headers("XX")), null);
assert.equal(countryFrom(headers("USA")), null);
assert.equal(countryFrom(headers("1x")), null);
assert.equal(countryFrom(headers(null)), null);
assert.equal(countryFrom(undefined), null);

// context: trimmed, capped, control characters removed, empty values left out
const context = playerContext(
  { platform: "Android", deviceModel: " Oculus\u0000 Quest 2 ", os: "x".repeat(200), language: "", appVersion: 7 },
  headers("fr")
);
assert.equal(context.platform, "quest");
assert.equal(context.device_model, "Oculus Quest 2");
assert.equal(context.os.length, 64);
assert.equal(context.country, "FR");
assert.ok(!("language" in context), "an empty language is left out");
assert.ok(!("app_version" in context), "a number is not a version");
assert.deepEqual(playerContext({}, headers(null)), {});
assert.deepEqual(playerContext(null, undefined), {});

// labels
assert.equal(valueLabel("platform", "quest"), "Meta Quest");
assert.equal(valueLabel("platform", "novel"), "novel");
assert.equal(valueLabel("country", "DE"), "Germany");
assert.equal(valueLabel("country", "ZZZZ"), "ZZZZ");
assert.equal(valueLabel("language", "German"), "German");
assert.equal(valueLabel("device", null), "Unknown");

// developer table: share of sessions, ad views per session over every session
const dev = audienceTable(
  [
    { value: "windows", sessions: 30, players: 10, views: 30, visible_seconds: 60, visible_n: 30 },
    { value: "quest", sessions: 60, players: 25, views: 120, visible_seconds: 300, visible_n: 120 },
    { value: null, sessions: 10, players: 4, views: 0, visible_seconds: 0, visible_n: 0 },
  ],
  "platform",
  "developer"
);
assert.deepEqual(dev.map((row) => row.label), ["Meta Quest", "Windows", "Unknown"]);
assert.equal(dev[0].share, 0.6);
assert.equal(dev[0].perSession, 2);
assert.equal(dev[0].avgView, 2.5);
assert.equal(dev[1].perSession, 1);
assert.equal(dev[2].perSession, 0);
assert.equal(dev[2].avgView, null, "no views, no average");

// advertiser table: share of impressions
const adv = audienceTable(
  [
    { value: "DE", sessions: 4, players: 3, views: 8, visible_seconds: "16", visible_n: 8 },
    { value: "US", sessions: 6, players: 5, views: 12, visible_seconds: "48", visible_n: 12 },
  ],
  "country",
  "advertiser"
);
assert.deepEqual(adv.map((row) => row.label), ["United States", "Germany"]);
assert.equal(adv[0].share, 0.6);
assert.equal(adv[0].perSession, 2);
assert.equal(adv[1].avgView, 2);

// a long tail is folded into one Other row; the shares still add up
const many = Array.from({ length: 12 }, (_, index) => ({ value: "d" + index, sessions: 12 - index, players: 1, views: 1, visible_seconds: 2, visible_n: 1 }));
const folded = audienceTable(many, "device", "developer", { top: 8 });
assert.equal(folded.length, 9);
assert.equal(folded[8].label, "Other");
assert.equal(folded[8].sessions, 4 + 3 + 2 + 1);
assert.ok(Math.abs(folded.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-9);
assert.deepEqual(audienceTable([], "os", "developer"), []);
assert.deepEqual(audienceTable(undefined, "os", "advertiser"), []);

// loading: one call per dimension; a failing call (migration 0034 not run) turns the panel off instead of breaking the page
const asked = [];
const ok = await loadAudience(async (dimension) => {
  asked.push(dimension);
  return { data: [{ value: "x" }] };
});
assert.deepEqual(asked, DIMENSION_IDS);
assert.equal(ok.missing, false);
assert.equal(ok.dimensions.country.length, 1);
const failed = await loadAudience(async (dimension) => (dimension === "os" ? { error: { code: "42883" } } : { data: [] }));
assert.equal(failed.missing, true);
assert.deepEqual(failed.dimensions, {});

console.log("audience: ok");
