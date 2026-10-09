import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import Audience from "./audience";
import Workbench from "./workbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formats" };

export default async function CreativeFormatsPage({ params }) {
  const { id } = await params;
  const me = await getMember();
  if (!me) notFound();
  const { service, user } = me;

  const read = (columns) =>
    service.from("creatives").select(columns).eq("id", id).eq("owner_id", user.id).maybeSingle();
  // The safe zone comes with migration 0017.
  let { data: creative, error } = await read("id, name, storage_path, width_px, height_px, status, safe_x, safe_y, safe_w, safe_h");
  const migrated = !isSchemaOutdated(error);
  if (!migrated) ({ data: creative } = await read("id, name, storage_path, width_px, height_px, status"));
  if (!creative) notFound();

  // Which games may show the creative comes with migration 0018. Only advertisers aim creatives; the
  // catalog is the games that have opened placements, so the page can say how many fit.
  let audience = null;
  let audienceMissing = false;
  let catalog = null;
  if (me.role === "advertiser") {
    const targetingRead = await service
      .from("creatives")
      .select("targeting")
      .eq("id", creative.id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (targetingRead.error) audienceMissing = isSchemaOutdated(targetingRead.error);
    else {
      audience = { targeting: targetingRead.data?.targeting ?? null };
      const { data: open, error: openError } = await service
        .from("placements")
        .select("game_id, games(genres, platforms, languages)")
        .eq("open_to_advertisers", true)
        .is("removed_at", null)
        .neq("owner_id", user.id);
      if (!openError) {
        const byGame = new Map();
        for (const row of open ?? []) {
          if (row.games && !byGame.has(row.game_id)) byGame.set(row.game_id, row.games);
        }
        catalog = [...byGame.values()];
      }
    }
  }

  const urlOf = (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;
  let assets = [];
  if (migrated) {
    const { data } = await service
      .from("creative_assets")
      .select("id, format_id, aspect, storage_path, width_px, height_px, status, review_note")
      .eq("creative_id", creative.id)
      .order("created_at", { ascending: true });
    assets = (data ?? []).map((row) => ({
      id: row.id,
      formatId: row.format_id,
      aspect: Number(row.aspect),
      url: urlOf(row.storage_path),
      width: row.width_px,
      height: row.height_px,
      status: row.status,
      note: row.review_note ?? "",
    }));
  }

  return (
    <>
      <div className="main-head">
        <h1>{creative.name}</h1>
        <Link href="/dashboard/creatives" className="button button-quiet">
          Back
        </Link>
      </div>
      <p className="lede">
        Make sure this creative looks right on every shape of placement: mark what must stay visible and add
        pictures made for specific formats.
      </p>
      {!migrated && (
        <p className="notice">
          Run <code>supabase/migrations/0017_ad_formats.sql</code> in the Supabase SQL editor to turn this on.
        </p>
      )}
      {migrated && (
        <Workbench
          creative={{
            id: creative.id,
            name: creative.name,
            url: urlOf(creative.storage_path),
            width: creative.width_px,
            height: creative.height_px,
            safe: { x: creative.safe_x, y: creative.safe_y, w: creative.safe_w, h: creative.safe_h },
          }}
          assets={assets}
        />
      )}
      {audience && <Audience creativeId={creative.id} initial={audience.targeting} catalog={catalog} />}
      {audienceMissing && (
        <p className="notice">
          Run <code>supabase/migrations/0018_targeting.sql</code> in the Supabase SQL editor to choose which
          games may show this creative.
        </p>
      )}
    </>
  );
}
