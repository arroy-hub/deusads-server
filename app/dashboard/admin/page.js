import { notFound } from "next/navigation";
import { getAdmin } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { formatLabel } from "../../../lib/formats";
import { loadBookings } from "../../../lib/bookings-data";
import { attachControls } from "../../../lib/advertiser-data";
import { reviewRows, reviewWidgets, creativeEvents, REVIEW_GROUPS, REVIEW_DEFAULTS } from "../../../lib/admin-review";
import { userClient } from "../../../lib/supabase-server";
import { loadDeckLayout } from "../../../lib/deck-layout-data";
import ReviewView from "./review-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review creatives" };

const WINDOW_DAYS = 90;

export default async function ModerationPage() {
  const admin = await getAdmin();
  if (!admin) notFound();
  const { service } = admin;
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const urlOf = (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;

  // Everything waiting, plus everything uploaded in the last 90 days (for the history and the board).
  // Review columns come with migration 0008, the category with 0015; the older shapes still load.
  const read = (columns) =>
    service.from("creatives").select(columns).neq("kind", "own").or(`status.eq.pending,created_at.gte.${since}`).order("created_at", { ascending: false }).limit(2000);
  const base = "id, name, storage_path, width_px, height_px, status, created_at, owner_id, accounts(email, company)";
  let result = await read(`${base}, review_note, reviewed_at, ad_category`);
  if (isSchemaOutdated(result.error)) result = await service.from("creatives").select(`${base}, review_note, reviewed_at`).or(`status.eq.pending,created_at.gte.${since}`).order("created_at", { ascending: false }).limit(2000);
  if (isSchemaOutdated(result.error)) result = await service.from("creatives").select(base).or(`status.eq.pending,created_at.gte.${since}`).order("created_at", { ascending: false }).limit(2000);
  const migrated = !result.error;
  const creatives = result.data ?? [];

  // Extra per-format pictures waiting for review (migration 0017; absent before it).
  const assetResult = await service
    .from("creative_assets")
    .select("id, storage_path, width_px, height_px, created_at, format_id, creatives(name, owner_id, ad_category, accounts(email, company))")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const assets = assetResult.error
    ? []
    : (assetResult.data ?? []).map((row) => ({
        id: row.id,
        name: `${row.creatives?.name ?? "Creative"} · ${formatLabel(row.format_id)}`,
        storage_path: row.storage_path,
        width_px: row.width_px,
        height_px: row.height_px,
        created_at: row.created_at,
        ownerId: row.creatives?.owner_id ?? null,
        owner: row.creatives?.accounts?.company || row.creatives?.accounts?.email || "Unknown",
        email: row.creatives?.accounts?.email ?? "",
        category: row.creatives?.ad_category ?? "other",
      }));

  const shaped = reviewRows({ creatives, assets, urlOf });
  const all = [...shaped.creatives, ...shaped.assets];

  // Where each creative runs and what was reported about it, for the card.
  const ids = shaped.creatives.map((row) => row.id);
  const [{ bookings }, disputeResult] = await Promise.all([
    ids.length ? loadBookings(service, (query) => query.in("creative_id", ids.slice(0, 300)), { limit: 1000 }) : { bookings: [] },
    ids.length ? service.from("creative_disputes").select("id, game_id, developer_id, creative_id, reason, comment, status, outcome, created_at").in("creative_id", ids.slice(0, 300)) : { data: [] },
  ]);
  await attachControls(service, bookings);
  const disputes = disputeResult.data ?? [];
  const names = new Map();
  if (disputes.length) {
    const [games, devs] = await Promise.all([
      service.from("games").select("id, name").in("id", [...new Set(disputes.map((d) => d.game_id))]),
      service.from("accounts").select("id, email, company").in("id", [...new Set(disputes.map((d) => d.developer_id))]),
    ]);
    for (const g of games.data ?? []) names.set(g.id, g.name);
    for (const a of devs.data ?? []) names.set(a.id, a.company || a.email);
  }
  const layout = await userClient().then((db) => loadDeckLayout(db, "admin_review"));
  return <ReviewView rows={all} widgets={reviewWidgets(all)} groups={REVIEW_GROUPS} defaults={REVIEW_DEFAULTS} layout={layout} canNote={migrated} />;
}
