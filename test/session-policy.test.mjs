// The sign-in rules of the dashboard. Run: node test/session-policy.test.mjs
import assert from "node:assert/strict";
import {
  IDLE_LIMIT, REMEMBER_SECONDS, TOTAL_LIMIT, TOUCH_EVERY, isSupabaseAuthCookie, judge, newReset, newSession, noticeFor,
  rememberOf, resetValid, seal, sessionCookieOptions, supabaseCookieOptions, unseal,
} from "../lib/session-policy.js";

const MIN = 60 * 1000;
const H = 60 * MIN;
const D = 24 * H;
const T0 = Date.UTC(2026, 9, 26, 9, 0, 0);

// ---- the limits that were agreed
assert.equal(IDLE_LIMIT.remember, 4 * D);
assert.equal(IDLE_LIMIT.browser, D);
assert.equal(TOTAL_LIMIT, 30 * D);
assert.equal(REMEMBER_SECONDS, 4 * 24 * 3600);

// ---- with "Remember me": 4 days without activity
const kept = newSession(true, T0);
assert.deepEqual(judge(kept, T0), { ok: true, touch: false });
assert.equal(judge(kept, T0 + TOUCH_EVERY - 1).touch, false);
assert.equal(judge(kept, T0 + TOUCH_EVERY).touch, true, "activity is written down every 10 minutes");
assert.equal(judge(kept, T0 + 4 * D - 1).ok, true);
assert.deepEqual(judge(kept, T0 + 4 * D), { ok: false, why: "idle" });
assert.equal(judge({ ...kept, l: T0 + 3 * D }, T0 + 6 * D).ok, true, "a visit moves the 4 days on");

// ---- without it: 24 hours without activity (closing the browser drops the cookie itself)
const browser = newSession(false, T0);
assert.equal(judge(browser, T0 + D - 1).ok, true);
assert.deepEqual(judge(browser, T0 + D), { ok: false, why: "idle" });

// ---- active every day: still ends 30 days after signing in
assert.equal(judge({ ...kept, l: T0 + 29 * D }, T0 + 29 * D + H).ok, true);
assert.deepEqual(judge({ ...kept, l: T0 + 30 * D - H }, T0 + 30 * D), { ok: false, why: "ended" });
assert.deepEqual(judge({ ...browser, l: T0 + 30 * D - H }, T0 + 30 * D), { ok: false, why: "ended" });

// ---- anything else is not a sign-in of ours
assert.deepEqual(judge(null, T0), { ok: false, why: "missing" });
assert.equal(judge({ v: 2, r: 1, s: T0, l: T0 }, T0).why, "missing");
assert.equal(judge({ v: 1, r: 1, s: "x", l: T0 }, T0).why, "missing");
assert.equal(judge({ ...kept, l: T0 + D }, T0).why, "missing", "activity from the future");
assert.equal(judge({ ...kept, l: T0 - H }, T0).why, "missing", "activity before the sign-in");

// ---- what the sign-in screen says
assert.equal(noticeFor({ ok: false, why: "idle" }, kept), "idle-4d");
assert.equal(noticeFor({ ok: false, why: "idle" }, browser), "idle-24h");
assert.equal(noticeFor({ ok: false, why: "ended" }, kept), "ended");
assert.equal(noticeFor({ ok: false, why: "missing" }, null), null);

// ---- the cookie is signed: it cannot be changed or made up
const secret = "test-secret";
const sealed = await seal(kept, secret);
assert.deepEqual(await unseal(sealed, secret), kept);
assert.equal(await unseal(sealed, "another-secret"), null);
const signaturePart = sealed.split(".")[1];
const changedBody = Buffer.from(JSON.stringify({ ...kept, l: T0 + 10 * D })).toString("base64url");
assert.equal(await unseal(`${changedBody}.${signaturePart}`, secret), null, "a changed body fails the signature");
assert.equal(await unseal("nonsense", secret), null);
assert.equal(await unseal("a.b.c", secret), null);
assert.equal(await unseal("", secret), null);
assert.equal(await unseal(sealed, ""), null);
await assert.rejects(() => seal(kept, ""), /SESSION_SECRET/);

assert.equal(rememberOf(sealed), true);
assert.equal(rememberOf(await seal(browser, secret)), false);
assert.equal(rememberOf(undefined), false);
assert.equal(rememberOf("%%%.x"), false);

// ---- how long cookies are kept
assert.equal(sessionCookieOptions(true).maxAge, REMEMBER_SECONDS);
assert.equal("maxAge" in sessionCookieOptions(false), false, "until the browser closes");
assert.equal(sessionCookieOptions(false).httpOnly, true);
const supabaseDefault = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 24 * 3600 };
assert.equal(supabaseCookieOptions(supabaseDefault, true).maxAge, REMEMBER_SECONDS);
assert.equal("maxAge" in supabaseCookieOptions(supabaseDefault, false), false);
assert.equal(supabaseCookieOptions(supabaseDefault, false).path, "/");
assert.equal(supabaseCookieOptions({ ...supabaseDefault, maxAge: 0 }, false).maxAge, 0, "a deletion stays a deletion");
assert.equal(supabaseCookieOptions({ ...supabaseDefault, maxAge: 0 }, true).maxAge, 0);
assert.equal(isSupabaseAuthCookie("sb-abcd-auth-token"), true);
assert.equal(isSupabaseAuthCookie("sb-abcd-auth-token.1"), true);
assert.equal(isSupabaseAuthCookie("sb-abcd-auth-token-code-verifier"), false);
assert.equal(isSupabaseAuthCookie("deus_session"), false);

// ---- a reset link: 30 minutes, for that account only
const reset = newReset("user-1", T0);
assert.equal(resetValid(reset, "user-1", T0 + 29 * MIN), true);
assert.equal(resetValid(reset, "user-1", T0 + 30 * MIN), false);
assert.equal(resetValid(reset, "user-2", T0), false);
assert.equal(resetValid(null, "user-1", T0), false);
assert.equal(resetValid(reset, null, T0), false);

console.log("session-policy: ok");
