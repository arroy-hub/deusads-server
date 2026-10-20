import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import Workbench from "./workbench";
import { canAdvertise } from "../../../../lib/admin-rules";
import { FORMATS } from "../../../../lib/formats";
import { coverageSummary, creativeShape } from "../../../../lib/advertiser-overview";
import AdvertiserWindow from "../../advertising/advertiser-window";
import CreativeEditor from "./creative-editor";
import { loadCreativeEditor } from "../../../../lib/advertiser-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creative" };

export default async function CreativeFormatsPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  // The new-campaign wizard sends people here to add pictures and wants them back afterwards.
  const back = typeof query?.back === "string" && query.back.startsWith("/dashboard/advertising/new") ? query.back : "";
  const me = await getMember();
  if (!me) notFound();
  const { service, user } = me;

  // An advertiser edits a creative in a pop-up over the Creatives tab.
  if (canAdvertise(me.role)) {
    const editor = await loadCreativeEditor(service, me, id);
    if (!editor) notFound();
    if (editor.migrated) {
      return (
        <>
          <AdvertiserWindow me={me} tab="cr" />
          <CreativeEditor editor={editor} backTo={back} />
        </>
      );
    }
  }

  const read = (columns) =>
    service.from("creatives").select(columns).eq("id", id).eq("owner_id", user.id).maybeSingle();
  // The safe zone comes with migration 0017.
  let { data: creative, error } = await read("id, name, storage_path, width_px, height_px, status, review_note, safe_x, safe_y, safe_w, safe_h");
  const migrated = !isSchemaOutdated(error);
  if (!migrated) ({ data: creative } = await read("id, name, storage_path, width_px, height_px, status"));
  if (!creative) notFound();

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

  // Which open placements this creative cannot be shown in for lack of a picture (an advertiser's view; migration 0017).
  let coverage = null;
  if (migrated && canAdvertise(me.role)) {
    let shapesQuery = service.from("placements").select("aspect_ratio").eq("open_to_advertisers", true).is("removed_at", null);
    if (me.role !== "admin") shapesQuery = shapesQuery.neq("owner_id", user.id);
    const { data: shapes, error: shapesError } = await shapesQuery;
    if (!shapesError) {
      coverage = coverageSummary({
        creative: creativeShape(creative),
        assets: assets.map((asset) => ({ formatId: asset.formatId, aspect: asset.aspect, status: asset.status })),
        placements: (shapes ?? []).map((row) => ({ aspect: row.aspect_ratio == null ? null : Number(row.aspect_ratio) })),
      });
    }
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
        Settings of this one creative: how it looks on placements of every shape (mark what must stay visible, add
        pictures made for specific formats){audience ? ", and which games may show it" : ""}.
      </p>
      {!migrated && (
        <p className="notice">
          Run <code>supabase/migrations/0017_ad_formats.sql</code> in the Supabase SQL editor to turn this on.
        </p>
      )}
      {coverage && coverage.placements > 0 && (
        <section className="panel" aria-labelledby="coverage-title" style={{ marginBottom: "1.5rem" }}>
          <h2 id="coverage-title">Where it can show</h2>
          <div className="ov-cover" style={{ marginTop: "0.75rem" }}>
            <div className="ov-cover-bar" role="img" aria-label={`${FORMATS.length - coverage.missingFormats.length} of ${FORMATS.length} formats ready`}>
              {FORMATS.map((format) => (
                <span key={format.id} className={coverage.missingFormats.includes(format.id) ? "is-missing" : undefined} title={format.label} />
              ))}
            </div>
            <p>
              <strong>
                {FORMATS.length - coverage.missingFormats.length} of {FORMATS.length} formats ready.
              </strong>{" "}
              {coverage.missingPlacements === 0
                ? "Every placement open to advertisers can show this creative."
                : `Not shown in ${coverage.missingPlacements} of ${coverage.placements} open placements: no picture for ${coverage.missingLabels.join(", ")}. Cropping the main image would cut your safe zone, so upload a picture made for each missing format below.`}
            </p>
          </div>
        </section>
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
    </>
  );
}
