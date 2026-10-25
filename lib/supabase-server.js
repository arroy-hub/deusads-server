import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE, rememberOf, supabaseCookieOptions } from "./session-policy";

/** Supabase client bound to the signed-in user, so row-level security applies. One per request (the layout and the page share it). */
export const userClient = cache(async function userClient() {
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // Supabase's cookies last as long as the sign-in: 4 days with "Remember me", otherwise until the browser closes.
          const remember = rememberOf(store.get(SESSION_COOKIE)?.value);
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, supabaseCookieOptions(options, remember)));
          } catch {
            // Called from a Server Component; middleware refreshes the session instead.
          }
        },
      },
    }
  );
});

/** The signed-in user, or null. Asked of Supabase once per request, however many places need it (each ask is a round trip). */
export const currentUser = cache(async function currentUser() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  return data?.user ?? null;
});
