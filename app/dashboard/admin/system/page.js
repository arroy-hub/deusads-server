import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { loadAppliedVersions } from "../../../../lib/schema-versions";
import { migrationStatus, schemaVerdict, unknownVersions } from "../../../../lib/migrations";
import { Band, Pill } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "System" };

const TONE = { applied: "good", missing: "bad", unknown: "warn" };
const LABEL = { applied: "Applied", missing: "Not applied", unknown: "Unknown" };

export default async function SystemPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const applied = await loadAppliedVersions(admin.service);
  const rows = migrationStatus(applied);
  const verdict = schemaVerdict(applied);
  const ahead = unknownVersions(applied);
  const count = (state) => rows.filter((r) => r.state === state).length;
  const missing = rows.filter((r) => r.state === "missing");
  const rest = rows.filter((r) => r.state !== "missing");
  const done = count("applied");
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;

  return (
    <>
      <Band
        title="System"
        info="The database against the code you are running. Every migration records itself when it is run, so a database that is behind shows up here instead of as an error somewhere else."
        sub="Is the database up to date with this version of the dashboard?"
      />
      <div className="ad-unit" style={{ maxWidth: 920 }}>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Pill tone={verdict.ok ? "good" : "bad"}>{verdict.ok ? "Up to date" : "Database is behind"}</Pill>
            <span style={{ fontWeight: 600 }}>{verdict.text}</span>
          </div>
          <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Migrations applied" style={{ marginTop: 16, height: 8, borderRadius: 99, background: "#ece5dd", overflow: "hidden" }}>
            <i style={{ display: "block", height: "100%", width: `${percent}%`, background: verdict.ok ? "#1b8a50" : "#c94a24" }} />
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 16, flexWrap: "wrap" }}>
            {["applied", "missing", "unknown"].map((s) => (
              <div key={s}><div className="ad-eyebrow">{LABEL[s]}</div><div style={{ fontSize: "1.6rem", fontWeight: 700, color: s === "missing" && count(s) > 0 ? "#c2391b" : undefined }}>{count(s)}</div></div>
            ))}
            <div><div className="ad-eyebrow">Total</div><div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{rows.length}</div></div>
          </div>
        </div>

        {ahead.length > 0 && (
          <div className="ad-note">The database has migrations this version of the dashboard does not know ({ahead.join(", ")}). The dashboard is probably behind: check that the latest deploy finished.</div>
        )}

        {missing.length > 0 && (
          <div style={{ padding: "0 20px 18px" }}>
            <h3 style={{ margin: "4px 0 6px", fontSize: ".95rem" }}>Run these in the SQL Editor, in this order</h3>
            <p className="ad-mute" style={{ margin: "0 0 10px" }}>Open each file from <code>supabase/migrations</code>, paste it and run it. It is safe to run a file twice.</p>
            <div className="ad-panel">
              {missing.map((r, i) => (
                <div key={r.version} className="ad-row" style={{ gridTemplateColumns: "28px minmax(0,1fr) auto" }}>
                  <div className="ad-mute">{i + 1}</div>
                  <div><b><code>{r.file}</code></b><small>{r.summary}</small></div>
                  <Pill tone="bad">Not applied</Pill>
                </div>
              ))}
            </div>
          </div>
        )}

        <details style={{ borderTop: "1px solid var(--line)" }}>
          <summary style={{ padding: "14px 20px", cursor: "pointer", fontWeight: 600 }}>Show all {rows.length}</summary>
          <div style={{ padding: "0 20px 18px" }}>
            <div className="ad-panel">
              {[...missing, ...rest].map((r) => (
                <div key={r.version} className="ad-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <div><b><code>{r.file}</code></b><small>{r.summary}{r.appliedAt ? ` · ${String(r.appliedAt).slice(0, 10)}` : ""}</small></div>
                  <Pill tone={TONE[r.state]}>{LABEL[r.state]}</Pill>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </>
  );
}
