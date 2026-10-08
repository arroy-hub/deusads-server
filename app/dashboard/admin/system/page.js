import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { loadAppliedVersions } from "../../../../lib/schema-versions";
import { migrationStatus, schemaVerdict, unknownVersions } from "../../../../lib/migrations";

export const dynamic = "force-dynamic";
export const metadata = { title: "System" };

const LABEL = { applied: "Applied", missing: "Not applied", unknown: "Unknown" };

export default async function SystemPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const applied = await loadAppliedVersions(admin.service);
  const rows = migrationStatus(applied);
  const verdict = schemaVerdict(applied);
  const ahead = unknownVersions(applied);

  return (
    <>
      <div className="main-head">
        <h1>System</h1>
      </div>
      <p className="lede">
        The database against the code you are running. Every migration records itself when it is run, so
        a database that is behind shows up here instead of as an error somewhere else.
      </p>

      <p className={verdict.ok ? "upload-done" : "notice"} role="status" style={{ marginBottom: "1.5rem" }}>
        {verdict.text}
      </p>

      {ahead.length > 0 && (
        <p className="notice" style={{ marginBottom: "1.5rem" }}>
          The database has migrations this version of the dashboard does not know ({ahead.join(", ")}).
          The dashboard is probably behind: check that the latest deploy finished.
        </p>
      )}

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Migration</th>
              <th>What it does</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.version}>
                <td>
                  <code>{row.file}</code>
                </td>
                <td>{row.summary}</td>
                <td>
                  {LABEL[row.state]}
                  {row.appliedAt && <div className="muted-line">{String(row.appliedAt).slice(0, 10)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
