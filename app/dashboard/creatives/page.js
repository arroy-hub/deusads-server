import { userClient } from "../../../lib/supabase-server";
import { isSchemaOutdated } from "../../../lib/api";
import { categoryLabel } from "../../../lib/categories";
import UploadForm from "./upload-form";
import CreativeRow from "./creative-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creatives" };

export default async function CreativesPage() {
  const db = await userClient();
  const listCreatives = (columns) =>
    db.from("creatives").select(columns).order("created_at", { ascending: false });

  // review_note comes with migration 0008; without it the list still shows.
  // ad_category comes with migration 0015.
  let { data: creatives, error } = await listCreatives(
    "id, name, storage_path, width_px, height_px, status, created_at, review_note, ad_category"
  );
  if (isSchemaOutdated(error)) {
    ({ data: creatives, error } = await listCreatives(
      "id, name, storage_path, width_px, height_px, status, created_at, review_note"
    ));
  }
  if (isSchemaOutdated(error)) {
    ({ data: creatives } = await listCreatives("id, name, storage_path, width_px, height_px, status, created_at"));
  }

  // How many placements show each creative right now.
  const { data: live } = await db.from("assignments").select("creative_id").eq("active", true);
  const usedBy = new Map();
  for (const row of live ?? []) usedBy.set(row.creative_id, (usedBy.get(row.creative_id) ?? 0) + 1);

  return (
    <>
      <div className="main-head">
        <h1>Creatives</h1>
      </div>
      <p className="lede">
        Images you can put on any placement. PNG or JPG, under 8 MB. Replacing what a
        placement shows never needs a new build of the game.
      </p>

      <UploadForm />

      {creatives?.length ? (
        <div className="panel" style={{ marginTop: "1.5rem", padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th aria-label="Preview" />
                <th>Name</th>
                <th>Size</th>
                <th>Status</th>
                <th>In use</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {creatives.map((creative) => (
                <CreativeRow
                  key={creative.id}
                  id={creative.id}
                  name={creative.name}
                  url={db.storage.from("creatives").getPublicUrl(creative.storage_path).data.publicUrl}
                  size={
                    creative.width_px && creative.height_px
                      ? `${creative.width_px} × ${creative.height_px}`
                      : "—"
                  }
                  status={creative.status}
                  note={creative.review_note ?? ""}
                  category={creative.ad_category ? categoryLabel(creative.ad_category) : ""}
                  usedBy={usedBy.get(creative.id) ?? 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" style={{ marginTop: "1.5rem" }}>
          <p style={{ margin: "0 auto" }}>No creatives yet. Upload one above.</p>
        </div>
      )}
    </>
  );
}
