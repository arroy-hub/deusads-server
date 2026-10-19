import { notFound } from "next/navigation";
import { getAdmin } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { reviewRows, reviewWidgets, REVIEW_GROUPS, REVIEW_DEFAULTS } from "../../../lib/admin-review";
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

  // Extra per-format pictures are not moderated: they go live as soon as the advertiser uploads them.
  const assets = [];

  const shaped = reviewRows({ creatives, assets, urlOf });
  const all = [...shaped.creatives, ...shaped.assets];

  const layout = await userClient().then((db) => loadDeckLayout(db, "admin_review"));
  return <ReviewView rows={all} widgets={reviewWidgets(all)} groups={REVIEW_GROUPS} defaults={REVIEW_DEFAULTS} layout={layout} canNote={migrated} />;
}
