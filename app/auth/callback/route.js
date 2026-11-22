import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { userClient } from "../../../lib/supabase-server";
import {
  RESET_COOKIE, SESSION_COOKIE, newReset, newSession, resetCookieOptions, seal, sessionCookieOptions,
} from "../../../lib/session-policy";
import { allowsReset, landingPath, readEmailLink } from "../../../lib/email-link";

export const dynamic = "force-dynamic";

/**
 * Where the link in a confirmation or password-reset email lands.
 * With our own email templates (supabase/email-templates) the link points straight here and carries a one-time
 * token, which is checked now: the email links to our own domain only, and the link works in any browser.
 * With Supabase's default templates the link goes to Supabase first, which sends the browser here with a
 * one-time code; exchanging it is what creates the session. Both are accepted (see lib/email-link.js).
 * Without this the link leads to a page that quietly bounces back to sign-in.
 * A sign-in from a link lasts until the browser closes, as without "Remember me". A reset link
 * also lets the person set a new password without the old one for 30 minutes.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const link = readEmailLink(searchParams);
  // Where to go afterwards: only a path inside the dashboard (an email-change link comes back to the account page).
  const target = landingPath(searchParams.get("next"));

  if (!link) {
    return NextResponse.redirect(`${origin}/login?notice=expired`);
  }

  const db = await userClient();
  const { data, error } = link.kind === "token"
    ? await db.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash })
    : await db.auth.exchangeCodeForSession(link.code);

  if (error) {
    // Usually a link that was already used or has run out; with a code, also one opened in a different
    // browser from the one that asked for it.
    return NextResponse.redirect(`${origin}/login?notice=expired`);
  }

  // The first of the two confirmations of an email change signs nobody in: the person is already in the
  // dashboard or has to sign in, and the page they land on says what is still waiting.
  if (!data?.session) {
    return NextResponse.redirect(`${origin}${target}`);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await seal(newSession(false)), sessionCookieOptions(false));
  if (allowsReset(link, searchParams) && data?.user?.id) {
    store.set(RESET_COOKIE, await seal(newReset(data.user.id)), resetCookieOptions());
  }

  return NextResponse.redirect(`${origin}${target}`);
}
