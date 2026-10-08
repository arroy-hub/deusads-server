// The migrations this version of the code expects the database to have. When you add
// a file to supabase/migrations/, add it here too: test/migrations.test.mjs fails if
// the two lists differ. The database records what it has in public.schema_versions
// (migration 0012); Admin -> System compares the two.

export const MIGRATIONS = [
  { version: "0001", file: "0001_init.sql", summary: "Tables, row-level security, storage bucket" },
  { version: "0002", file: "0002_placement_sync_and_events.sql", summary: "Placement sync, removed placements, impression event ids" },
  { version: "0003", file: "0003_assignment_crop.sql", summary: "Framing (zoom and position) of a creative on a placement" },
  { version: "0004", file: "0004_security_hardening_grants.sql", summary: "Security: no anonymous reads, role and status locked" },
  { version: "0005", file: "0005_rls_performance.sql", summary: "Faster row-level security, foreign key indexes" },
  { version: "0006", file: "0006_game_stats.sql", summary: "Exact impression and session counts per game" },
  { version: "0007", file: "0007_game_analytics.sql", summary: "Per-day and per-placement analytics for a game" },
  { version: "0008", file: "0008_roles_and_moderation.sql", summary: "Creative review notes, advertiser creatives start pending" },
  { version: "0009", file: "0009_campaigns_and_bookings.sql", summary: "Campaigns and bookings with two-way approval" },
  { version: "0010", file: "0010_advertiser_reports.sql", summary: "Advertiser report figures" },
  { version: "0011", file: "0011_bookings_fk_indexes.sql", summary: "Indexes for booking foreign keys" },
  { version: "0012", file: "0012_schema_versions.sql", summary: "This record of applied migrations" },
  { version: "0013", file: "0013_process_gaps.sql", summary: "Advertiser applications, notifications, booking dates and schedule" },
];

/**
 * Every expected migration with its state, oldest first.
 * `applied` is the rows of schema_versions, or null when that table does not exist
 * yet (then nothing can be said about any migration: state "unknown").
 */
export function migrationStatus(applied, expected = MIGRATIONS) {
  const known = applied ? new Map(applied.map((row) => [row.version, row.applied_at])) : null;
  return expected.map((migration) => ({
    ...migration,
    state: known === null ? "unknown" : known.has(migration.version) ? "applied" : "missing",
    appliedAt: known?.get(migration.version) ?? null,
  }));
}

/** Versions recorded in the database that this code does not know: the code is behind. */
export function unknownVersions(applied, expected = MIGRATIONS) {
  const wanted = new Set(expected.map((migration) => migration.version));
  return (applied ?? []).map((row) => row.version).filter((version) => !wanted.has(version));
}

/** Short verdict for the admin menu and the System page. */
export function schemaVerdict(applied) {
  if (applied === null) return { ok: false, text: "Run 0012_schema_versions.sql to track migrations" };
  const missing = migrationStatus(applied).filter((item) => item.state === "missing");
  if (missing.length > 0) {
    return { ok: false, text: `${missing.length} migration${missing.length === 1 ? "" : "s"} not applied: ${missing.map((item) => item.version).join(", ")}` };
  }
  return { ok: true, text: "Database matches the code" };
}
