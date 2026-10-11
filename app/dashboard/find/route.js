import { NextResponse } from "next/server";
import { userClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /dashboard/find?placement=<ID>
 * The "Open in dashboard" button in Unity lands here: it finds the signed-in developer's placement with that
 * ID and goes to its game's Placements tab, with the placement opened. The signed-out are sent to sign in by
 * the middleware; row-level security means only the developer's own placements can be found.
 */
export async function GET(request) {
  const externalId = (request.nextUrl.searchParams.get("placement") ?? "").trim().slice(0, 200);
  const home = new URL("/dashboard", request.url);
  if (!externalId) return NextResponse.redirect(home);

  const db = await userClient();
  const { data } = await db
    .from("placements")
    .select("game_id")
    .eq("external_id", externalId)
    .is("removed_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  const gameId = data?.[0]?.game_id;
  if (!gameId) return NextResponse.redirect(home);

  const target = new URL(`/dashboard/g/${gameId}`, request.url);
  target.searchParams.set("tab", "placements");
  target.searchParams.set("placement", externalId);
  return NextResponse.redirect(target);
}
