import { redirect } from "next/navigation";
import { getMember } from "../lib/admin";
import { homeFor } from "../lib/nav";

/**
 * Supabase sends confirmation links to the site root, so a code arriving here is
 * forwarded to the handler that exchanges it. Everything else goes to the person's landing page.
 */
export default async function Home({ searchParams }) {
  const params = await searchParams;
  const code = typeof params?.code === "string" ? params.code : null;

  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  // A signed-in person goes to their landing page (Home); anyone else reaches the sign-in through the dashboard.
  const me = await getMember().catch(() => null);
  redirect(me ? homeFor(me.role) : "/dashboard");
}
