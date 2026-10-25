import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE, isSupabaseAuthCookie, judge, noticeFor, rememberOf, seal, sessionCookieOptions, sessionSecret,
  supabaseCookieOptions, unseal,
} from "./lib/session-policy";

// Keeps the Supabase session cookie fresh, keeps the dashboard private and applies the sign-in rules of
// lib/session-policy.js: until the browser closes and at most 24 hours without activity; with "Remember me"
// 4 days without activity; 30 days after signing in at most.
// The SDK routes under /v1 authenticate by API key, so they are left alone.
export async function middleware(request) {
  let response = NextResponse.next({ request });
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const remember = rememberOf(raw);
  const written = new Set();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => {
            written.add(name);
            response.cookies.set(name, value, supabaseCookieOptions(options, remember));
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  // To the sign-in screen, carrying the cookies Supabase has just changed (a refresh or a sign-out).
  const toLogin = (notice) => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = notice ? `?notice=${notice}` : "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!data?.user) {
    return request.nextUrl.pathname.startsWith("/dashboard") ? toLogin(null) : response;
  }

  // Without a key to check the cookie with, the rules cannot apply: the dashboard works as before.
  const secret = sessionSecret();
  if (!secret) return response;

  const state = await unseal(raw, secret);
  const verdict = judge(state);
  if (!verdict.ok) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => null);
    const out = toLogin(noticeFor(verdict, state));
    out.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(false), maxAge: 0 });
    return out;
  }

  if (verdict.touch) {
    const keep = state.r === 1;
    response.cookies.set(SESSION_COOKIE, await seal({ ...state, l: Date.now() }, secret), sessionCookieOptions(keep));
    // With "Remember me" Supabase's cookies get their 4 days again too (they are rewritten only on a token refresh).
    if (keep) {
      for (const cookie of request.cookies.getAll()) {
        if (isSupabaseAuthCookie(cookie.name) && !written.has(cookie.name)) {
          response.cookies.set(cookie.name, cookie.value, supabaseCookieOptions({ path: "/", sameSite: "lax", httpOnly: false }, true));
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
