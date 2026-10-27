import { redirect } from "next/navigation";
import { userClient } from "../../../lib/supabase-server";
import { isSchemaOutdated } from "../../../lib/api";
import { getMember } from "../../../lib/admin";
import { categoryLabel } from "../../../lib/categories";
import { targetingSummary } from "../../../lib/targeting";
import UploadForm from "./upload-form";
import CreativeRow from "./creative-row";
import { canAdvertise } from "../../../lib/admin-rules";
import WindowTop, { PlateIcon } from "../window-top";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creatives" };

export default async function CreativesPage() {
  const member = await getMember();
  // An advertiser's library is the Creatives tab of the Campaigns window.
  if (member && canAdvertise(member.role)) redirect("/dashboard/advertising?tab=creatives");
  const db = await userClient();
  // Pictures a developer put on their own placements (kind 'own', migration 0020) are not library creatives.
  const listCreatives = async (columns) => {
    const result = await db.from("creatives").select(columns).neq("kind", "own").order("created_at", { ascending: false });
    if (!isSchemaOutdated(result.error)) return result;
    return db.from("creatives").select(columns).order("created_at", { ascending: false });
  };

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

  // An advertiser's creatives may be aimed at some games (migration 0018); the list says which.
  // Without the migration, or for a developer, the list simply has no audience line.
  const me = await getMember();
  const advertiser = canAdvertise(me?.role);
  const audienceOf = new Map();
  if (advertiser) {
    const { data: aimed, error: aimedError } = await db.from("creatives").select("id, targeting");
    if (!aimedError) for (const row of aimed ?? []) audienceOf.set(row.id, targetingSummary(row.targeting));
  }

  // How many placements show each creative right now.
  const { data: live } = await db.from("assignments").select("creative_id").eq("active", true);
  const usedBy = new Map();
  for (const row of live ?? []) usedBy.set(row.creative_id, (usedBy.get(row.creative_id) ?? 0) + 1);

  return (
    <div className="wt-win">
      <WindowTop
        title="Creatives"
        icon={<PlateIcon name="creatives" />}
        sub={advertiser
          ? "Your image library for advertising. Upload a PNG or JPG under 8 MB; once DeusADS approves it, book it on placements under Find placements. Open a creative to set how it is cropped and which games may show it."
          : "Your image library. Upload a PNG or JPG under 8 MB, then pick it as your own creative on any of your placements. Changing what a placement shows never needs a new build of the game."}
      />

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
                  audience={audienceOf.get(creative.id) ?? ""}
                  canAim={advertiser}
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
    </div>
  );
}

