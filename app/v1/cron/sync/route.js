import { serviceClient } from "../../../../lib/api";
import { syncAllCampaigns } from "../../../../lib/campaign-sync";
import { reconcileFit } from "../../../../lib/audience-watch";

export const dynamic = "force-dynamic";

/** Daily safety net: books what campaigns started by audience are still missing. Vercel Cron sends CRON_SECRET as a bearer token. */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const service = serviceClient();
  const result = await syncAllCampaigns(service);
  // Then what every game fits against what was remembered, for changes nobody triggered (an advertiser's creative audience, say).
  const fit = await reconcileFit(service).catch(() => ({ skipped: "error" }));
  return Response.json({ ...result, fit });
}
