import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { bookingsMissing } from "../../../../lib/booking-rules";
import ApplicationRow from "./application-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const { data, error } = await admin.service
    .from("role_requests")
    .select("id, account_id, company, message, status, review_note, created_at, accounts(email)")
    .order("created_at", { ascending: false })
    .limit(100);

  const shape = (row) => ({
    id: row.id,
    company: row.company,
    message: row.message ?? "",
    status: row.status,
    note: row.review_note ?? "",
    email: row.accounts?.email ?? "",
    created: String(row.created_at).slice(0, 10),
  });
  const pending = (data ?? []).filter((row) => row.status === "pending").map(shape);
  const decided = (data ?? []).filter((row) => row.status !== "pending").map(shape);

  return (
    <>
      <div className="main-head">
        <h1>Applications</h1>
      </div>
      <p className="lede">
        Developers who ask to advertise. Approving makes the account an advertiser and sets its company
        name; rejecting tells the applicant why.
      </p>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0013_process_gaps.sql</code> in the Supabase SQL editor to turn
          applications on.
        </p>
      )}

      <h2 style={{ marginBottom: "0.75rem" }}>Waiting for review ({pending.length})</h2>
      {pending.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {pending.map((row) => (
                <ApplicationRow key={row.id} application={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>No applications are waiting.</p>
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 style={{ margin: "2.5rem 0 0.75rem" }}>Decided</h2>
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <tbody>
                {decided.map((row) => (
                  <ApplicationRow key={row.id} application={row} decided />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
