/**
 * How long a sign-in to the dashboard lasts. Supabase keeps the tokens; this file holds the rules DeusADS chose:
 *  - without "Remember me": until the browser is closed, and in any case it ends after 24 hours without activity;
 *  - with "Remember me": it ends after 4 days without activity (every visit moves that moment on);
 *  - either way it ends 30 days after signing in.
 * The facts sit in one small signed cookie that the middleware reads on every dashboard request. Only Web Crypto
 * is used, so the same code runs in the Edge middleware, in Node and in the tests.
 */

export const SESSION_COOKIE = "deus_session";
export const RESET_COOKIE = "deus_reset";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const IDLE_LIMIT = { remember: 4 * DAY, browser: DAY };
export const TOTAL_LIMIT = 30 * DAY;
/** Activity is written down at most this often, so not every click rewrites the cookie. */
export const TOUCH_EVERY = 10 * MINUTE;
export const REMEMBER_SECONDS = 4 * 24 * 60 * 60;
/** For how long a password-reset link lets its user set a new password without the old one. */
export const RESET_MINUTES = 30;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const text = atob(String(value).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

/** The key the cookie is signed with. A dedicated SESSION_SECRET wins; the service key is on every deployment already. */
export function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

const keys = new Map();
function hmacKey(secret) {
  if (!keys.has(secret)) {
    keys.set(secret, crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));
  }
  return keys.get(secret);
}

async function signature(body, secret) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
}

/** A signed text to keep in a cookie. */
export async function seal(payload, secret = sessionSecret()) {
  if (!secret) throw new Error("No SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY to sign the session with.");
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${toBase64Url(await signature(body, secret))}`;
}

/** What a sealed value holds, or null when it is missing, damaged or signed with another key. */
export async function unseal(value, secret = sessionSecret()) {
  if (!value || !secret) return null;
  const parts = String(value).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  let given;
  try {
    given = fromBase64Url(sig);
  } catch {
    return null;
  }
  const wanted = await signature(body, secret);
  if (given.length !== wanted.length) return null;
  let diff = 0;
  for (let index = 0; index < wanted.length; index += 1) diff |= given[index] ^ wanted[index];
  if (diff !== 0) return null;
  try {
    return JSON.parse(decoder.decode(fromBase64Url(body)));
  } catch {
    return null;
  }
}

/** Whether "Remember me" was ticked, read without checking the signature: it only decides how long cookies are kept. */
export function rememberOf(value) {
  try {
    const body = String(value ?? "").split(".")[0];
    if (!body) return false;
    return JSON.parse(decoder.decode(fromBase64Url(body)))?.r === 1;
  } catch {
    return false;
  }
}

/** A sign-in that starts now. */
export function newSession(remember, now = Date.now()) {
  return { v: 1, r: remember ? 1 : 0, s: now, l: now };
}

/**
 * What to do with a request. { ok: true, touch } keeps the person signed in (touch: write the activity down);
 * { ok: false, why } signs them out: "missing" (no cookie or not ours, e.g. the browser was closed),
 * "idle" (no activity for too long) or "ended" (30 days since signing in).
 */
export function judge(state, now = Date.now()) {
  if (!state || state.v !== 1 || !Number.isFinite(state.s) || !Number.isFinite(state.l)) return { ok: false, why: "missing" };
  if (state.s > now + 5 * MINUTE || state.l > now + 5 * MINUTE || state.l < state.s) return { ok: false, why: "missing" };
  const idle = state.r === 1 ? IDLE_LIMIT.remember : IDLE_LIMIT.browser;
  if (now - state.l >= idle) return { ok: false, why: "idle" };
  if (now - state.s >= TOTAL_LIMIT) return { ok: false, why: "ended" };
  return { ok: true, touch: now - state.l >= TOUCH_EVERY };
}

/** The notice the sign-in screen shows after the middleware signed someone out (null: none). */
export function noticeFor(verdict, state) {
  if (verdict?.why === "idle") return state?.r === 1 ? "idle-4d" : "idle-24h";
  if (verdict?.why === "ended") return "ended";
  return null;
}

/** Without "Remember me" the cookie has no lifetime, so the browser drops it when it closes. */
export function sessionCookieOptions(remember) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_SECONDS } : {}),
  };
}

/**
 * Supabase's own cookies follow the same choice: with "Remember me" they are kept 4 days from the last write,
 * otherwise until the browser closes (its default would be 400 days). A deletion is left as it is.
 */
export function supabaseCookieOptions(options = {}, remember) {
  const ending = options.maxAge === 0 || (options.expires && new Date(options.expires).getTime() <= Date.now());
  if (ending) return options;
  // eslint-disable-next-line no-unused-vars
  const { maxAge, expires, ...rest } = options;
  return remember ? { ...rest, maxAge: REMEMBER_SECONDS } : rest;
}

/** The cookies Supabase keeps the sign-in in: sb-<project>-auth-token, split into .0, .1 … when long. */
export function isSupabaseAuthCookie(name) {
  return /^sb-.+-auth-token(\.\d+)?$/.test(String(name));
}

/** Written when someone arrives from a password-reset link. */
export function newReset(userId, now = Date.now()) {
  return { v: 1, u: String(userId), e: now + RESET_MINUTES * MINUTE };
}

export function resetValid(state, userId, now = Date.now()) {
  return Boolean(state && state.v === 1 && userId && state.u === String(userId) && Number.isFinite(state.e) && state.e > now);
}

export function resetCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: RESET_MINUTES * 60 };
}
