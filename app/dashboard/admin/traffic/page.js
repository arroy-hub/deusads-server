import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { TRAFFIC_RULES, TRAFFIC_PERIODS, loadTraffic, loadTrafficSamples, periodFrom } from "../../../../lib/traffic";
import { trafficWidgets, TRAFFIC_GROUPS, TRAFFIC_DEFAULTS } from "../../../../lib/admin-traffic";
import { userClient } from "../../../../lib/supabase-server";
import { loadDeckLayout } from "../../../../lib/deck-layout-data";
import { Band } from "../ui";
import TrafficView from "./traffic-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Traffic" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrafficPage({ searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const params = await searchParams;
  const days = periodFrom(params?.days);
  const gameId = typeof params?.game === "string" && UUID.test(params.game) ? params.game : null;

  const [traffic, samples, layout] = await Promise.all([
    loadTraffic(() => admin.service.rpc("traffic_by_game", { p_days: days })),
    gameId ? loadTrafficSamples(() => admin.service.rpc("traffic_samples", { p_game: gameId, p_days: days, p_limit: 50 })) : Promise.resolve(null),
    userClient().then((db) => loadDeckLayout(db, "admin_traffic")),
  ]);

  if (traffic.missing) {
    return (
      <>
        <Band title="Traffic" />
        <p className="notice">Run <code>supabase/migrations/0040_suspicious_traffic.sql</code> in the Supabase SQL editor to turn this page on.</p>
      </>
    );
  }
  return (
    <TrafficView
      games={traffic.games}
      totals={{ views: traffic.totals.views, flagged: traffic.totals.flagged, share: traffic.totals.share }}
      rules={TRAFFIC_RULES.map((r) => ({ id: r.id, label: r.label, hint: r.hint }))}
      samples={samples ? samples.samples : null}
      pickedId={gameId}
      days={days}
      periods={TRAFFIC_PERIODS}
      widgets={trafficWidgets(traffic)}
      groups={TRAFFIC_GROUPS}
      defaults={TRAFFIC_DEFAULTS}
      layout={layout}
    />
  );
}
