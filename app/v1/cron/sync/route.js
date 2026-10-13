import { serviceClient } from "../../../../lib/api";
import { syncAllCampaigns } from "../../../../lib/campaign-sync";

export const dynamic = "force-dynamic";

/** Daily safety net: books what campaigns started by audience are still missing. Vercel Cron sends CRON_SECRET as a bearer token. */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const result = await syncAllCampaigns(serviceClient());
  return Response.json(result);
}
