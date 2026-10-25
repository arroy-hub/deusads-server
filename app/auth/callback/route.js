import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { userClient } from "../../../lib/supabase-server";
import {
  RESET_COOKIE, SESSION_COOKIE, newReset, newSession, resetCookieOptions, seal, sessionCookieOptions,
} from "../../../lib/session-policy";

export const dynamic = "force-dynamic";

/**
 * Where the link in a confirmation or password-reset email lands.
 * Supabase verifies the email on its own side and then sends the browser here
 * with a one-time code; exchanging it is what actually creates the session.
 * Without this the link leads to a page that quietly bounces back to sign-in.
 * A sign-in from a link lasts until the browser closes, as without "Remember me". A reset link (reset=1)
 * also lets the person set a new password without the old one for 30 minutes.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to go afterwards: only a path inside the dashboard (an email-change link comes back to the account page).
  const next = searchParams.get("next");
  const target = next && /^\/dashboard(\/|\?|$)/.test(next) && !next.startsWith("//") ? next : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?notice=expired`);
  }

  const db = await userClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);

  if (error) {
    // Usually a link that was already used, or opened in a different browser
    // from the one that signed up.
    return NextResponse.redirect(`${origin}/login?notice=expired`);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await seal(newSession(false)), sessionCookieOptions(false));
  if (searchParams.get("reset") === "1" && data?.user?.id) {
    store.set(RESET_COOKIE, await seal(newReset(data.user.id)), resetCookieOptions());
  }

  return NextResponse.redirect(`${origin}${target}`);
}
