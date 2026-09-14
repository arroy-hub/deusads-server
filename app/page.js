import { redirect } from "next/navigation";

/**
 * Supabase sends confirmation links to the site root, so a code arriving here is
 * forwarded to the handler that exchanges it. Everything else goes to the dashboard.
 */
export default async function Home({ searchParams }) {
  const params = await searchParams;
  const code = typeof params?.code === "string" ? params.code : null;

  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  redirect("/dashboard");
}
