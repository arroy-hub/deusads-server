"use client";

import { createBrowserClient } from "@supabase/ssr";

let client;

/**
 * Supabase client in the browser, signed in with the same session cookies as
 * the server. Used to send creative files straight to Storage, so a file never
 * passes through a Vercel function (1 MB action / 4.5 MB request limits).
 */
export function browserClient() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return client;
}
