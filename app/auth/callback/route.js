import { NextResponse } from "next/server";
import { userClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Where the link in a confirmation or password-reset email lands.
 * Supabase verifies the email on its own side and then sends the browser here
 * with a one-time code; exchanging it is what actually creates the session.
 * Without this the link leads to a page that quietly bounces back to sign-in.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?notice=expired`);
  }

  const db = await userClient();
  const { error } = await db.auth.exchangeCodeForSession(code);

  if (error) {
    // Usually a link that was already used, or opened in a different browser
    // from the one that signed up.
    return NextResponse.redirect(`${origin}/login?notice=expired`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
