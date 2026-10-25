"use server";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { currentRole } from "../../lib/admin";
import { homeFor } from "../../lib/nav";
import { SITE } from "../../lib/account-server";
import { isEmail } from "../../lib/account-rules";
import { SESSION_COOKIE, newSession, seal, sessionCookieOptions, supabaseCookieOptions } from "../../lib/session-policy";

// The three things the sign-in screen does. They run on the server so that every cookie of the sign-in
// (Supabase's and deus_session) gets the lifetime the person chose with "Remember me".

const MIN_PASSWORD = 8;
const GONE = "Connection lost. Try again.";

async function client(remember) {
  const store = await cookies();
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, supabaseCookieOptions(options, remember))),
    },
  });
  return { store, db };
}

async function startSession(store, remember) {
  store.set(SESSION_COOKIE, await seal(newSession(remember)), sessionCookieOptions(remember));
}

async function landing(db, userId, fallback = "developer") {
  const role = (await currentRole(db, userId).catch(() => null)) ?? fallback;
  return { role, home: homeFor(role) };
}

function signInProblem(error) {
  const text = String(error?.message ?? "");
  if (/invalid login credentials/i.test(text)) return "Wrong email or password. Check them and try again.";
  if (/not confirmed/i.test(text)) return "Confirm your email first: open the link we sent you when you signed up.";
  if (/rate|too many/i.test(text)) return "Too many attempts. Wait a minute and try again.";
  return "Could not sign in. Try again.";
}

/** Signs in. With `remember` the sign-in lasts 4 days from the last visit, otherwise until the browser closes. */
export async function signIn({ email, password, remember }) {
  const address = String(email ?? "").trim();
  if (!isEmail(address.toLowerCase()) || !password) return { error: "Enter your email and password." };
  const keep = remember === true;
  const { store, db } = await client(keep);
  const { data, error } = await db.auth.signInWithPassword({ email: address, password: String(password) }).catch(() => ({ error: { message: "" } }));
  if (error || !data?.user) return { error: error?.message === "" ? GONE : signInProblem(error) };
  await startSession(store, keep);
  return { ok: true, ...(await landing(db, data.user.id)) };
}

/** A new account. Usually the email must be confirmed first; if the project skips that, the person is signed in at once. */
export async function signUp({ email, password, accountType }) {
  const address = String(email ?? "").trim();
  if (!isEmail(address.toLowerCase())) return { error: "Enter a valid email address." };
  if (String(password ?? "").length < MIN_PASSWORD) return { error: `The password needs at least ${MIN_PASSWORD} characters.` };
  const type = accountType === "advertiser" ? "advertiser" : "developer";
  const { store, db } = await client(false);
  const { data, error } = await db.auth
    .signUp({ email: address, password: String(password), options: { data: { account_type: type } } })
    .catch(() => ({ error: { message: "" } }));
  if (error) {
    const text = String(error.message ?? "");
    if (!text) return { error: GONE };
    if (/already/i.test(text)) return { error: "This email already has an account. Sign in instead." };
    if (/password/i.test(text)) return { error: text };
    if (/rate|too many/i.test(text)) return { error: "Too many attempts. Wait a minute and try again." };
    return { error: "Could not create the account. Try again." };
  }
  if (data?.session && data.user) {
    await startSession(store, false);
    return { ok: true, signedIn: true, ...(await landing(db, data.user.id, type)) };
  }
  return { ok: true, confirm: true };
}

/**
 * Sends the password-reset email. Its link signs the person in (in this browser) and opens Your account →
 * Sign-in, where a new password can be set without the old one for 30 minutes. The answer is the same
 * whether or not the email has an account, so the screen does not reveal who is registered.
 */
export async function requestReset({ email }) {
  const address = String(email ?? "").trim();
  if (!isEmail(address.toLowerCase())) return { error: "Enter the email of your account." };
  const origin = (await headers()).get("origin") || SITE();
  const { db } = await client(false);
  const { error } = await db.auth
    .resetPasswordForEmail(address, { redirectTo: `${origin}/auth/callback?reset=1&next=/dashboard/account?tab=security` })
    .catch(() => ({ error: { message: "" } }));
  if (error && /rate|too many|seconds/i.test(String(error.message ?? ""))) return { error: "Too many requests. Wait a minute and try again." };
  if (error && !error.message) return { error: GONE };
  return { ok: true };
}
