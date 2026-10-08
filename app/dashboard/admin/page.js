import { notFound } from "next/navigation";
import { getAdmin } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import ReviewRow from "./review-row";

export const dynamic = "force-dynamic";

const COLUMNS = "id, name, storage_path, width_px, height_px, status, created_at, accounts(email, company)";

export default async function ModerationPage() {
  const admin = await getAdmin();
  if (!admin) notFound();
  const { service } = admin;

  const urlOf = (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;
  const shape = (row) => ({
    id: row.id,
    name: row.name,
    url: urlOf(row.storage_path),
    size: row.width_px && row.height_px ? `${row.width_px} × ${row.height_px}` : "—",
    status: row.status,
    note: row.review_note ?? "",
    owner: row.accounts?.company || row.accounts?.email || "Unknown",
    email: row.accounts?.email ?? "",
    created: String(row.created_at).slice(0, 10),
  });

  const pendingResult = await service
    .from("creatives")
    .select(`${COLUMNS}, review_note`)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Without migration 0008 there are no review columns: the queue still works.
  let pending = pendingResult.data;
  let reviewed = [];
  let migrated = true;
  if (isSchemaOutdated(pendingResult.error)) {
    migrated = false;
    ({ data: pending } = await service
      .from("creatives")
      .select(COLUMNS)
      .eq("status", "pending")
      .order("created_at", { ascending: true }));
  } else {
    const { data } = await service
      .from("creatives")
      .select(`${COLUMNS}, review_note`)
      .in("status", ["approved", "rejected"])
      .not("reviewed_at", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(20);
    reviewed = data ?? [];
  }

  return (
    <>
      <div className="main-head">
        <h1>Moderation</h1>
      </div>
      <p className="lede">
        Creatives from advertisers wait here until someone approves them. Only approved creatives
        reach the SDK; rejecting one that is already showing takes it off its placements at once.
      </p>

      {!migrated && (
        <p className="notice" style={{ marginBottom: "1.5rem" }}>
          Run <code>supabase/migrations/0008_roles_and_moderation.sql</code> in the Supabase SQL editor to
          enable rejection notes and the reviewed list.
        </p>
      )}

      <h2 style={{ marginBottom: "0.75rem" }}>Waiting for review ({pending?.length ?? 0})</h2>
      {pending?.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {pending.map((row) => (
                <ReviewRow key={row.id} creative={shape(row)} canNote={migrated} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>Nothing is waiting for review.</p>
        </div>
      )}

      {reviewed.length > 0 && (
        <>
          <h2 style={{ margin: "2.5rem 0 0.75rem" }}>Recently reviewed</h2>
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <tbody>
                {reviewed.map((row) => (
                  <ReviewRow key={row.id} creative={shape(row)} canNote />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
