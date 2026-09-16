import { userClient } from "../../../lib/supabase-server";
import UploadForm from "./upload-form";

export const dynamic = "force-dynamic";

export default async function CreativesPage() {
  const db = await userClient();
  const { data: creatives } = await db
    .from("creatives")
    .select("id, name, storage_path, width_px, height_px, status, created_at")
    .order("created_at", { ascending: false });

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
                <th>Name</th>
                <th>Size</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((creative) => (
                <tr key={creative.id}>
                  <td>{creative.name}</td>
                  <td>
                    {creative.width_px && creative.height_px
                      ? `${creative.width_px} × ${creative.height_px}`
                      : "—"}
                  </td>
                  <td>{creative.status}</td>
                </tr>
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
