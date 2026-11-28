import { shapeKey, shapeLabel } from "../../../lib/game-pictures";
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

  // Extra per-format pictures are not moderated: they go live as soon as the advertiser uploads them. The exception is
  // a new picture for a shape DeusADS asked to change after a report (migration 0065): it waits here, and approving it
  // puts that shape back into the games.
  const waiting = await service.from("creative_assets").select("id, creative_id, format_id, aspect, storage_path, width_px, height_px, created_at, creatives(name, owner_id, ad_category, accounts(email, company))").eq("status", "pending").order("created_at", { ascending: false }).limit(500);
  const assets = (waiting.data ?? []).map((a) => {
    const shape = shapeLabel(a.format_id ?? shapeKey(Number(a.aspect)));
    return {
      id: a.id,
      creativeId: a.creative_id,
      name: `${a.creatives?.name ?? "Creative"}${shape ? ` · ${shape}` : ""} · new picture after a report`,
      storage_path: a.storage_path,
      ownerId: a.creatives?.owner_id ?? null,
      owner: a.creatives?.accounts?.company || a.creatives?.accounts?.email || "Unknown",
      email: a.creatives?.accounts?.email ?? "",
      category: a.creatives?.ad_category ?? "other",
      width_px: a.width_px,
      height_px: a.height_px,
      created_at: a.created_at,
    };
  });

  const shaped = reviewRows({ creatives, assets, urlOf });
  const all = [...shaped.creatives, ...shaped.assets];

  const layout = await userClient().then((db) => loadDeckLayout(db, "admin_review"));
  return <ReviewView rows={all} widgets={reviewWidgets(all)} groups={REVIEW_GROUPS} defaults={REVIEW_DEFAULTS} layout={layout} canNote={migrated} />;
}
