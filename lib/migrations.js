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
  { version: "0014", file: "0014_open_to_advertisers.sql", summary: "Developers choose which placements advertisers can book" },
  { version: "0015", file: "0015_open_marketplace.sql", summary: "Account type at sign-up, ad categories, automatic booking approval, rotation" },
  { version: "0016", file: "0016_suspended_accounts.sql", summary: "Suspended accounts cannot get bookings approved" },
  { version: "0017", file: "0017_ad_formats.sql", summary: "Ad formats, per-format images and a safe zone for auto-cropping" },
  { version: "0018", file: "0018_targeting.sql", summary: "Games describe themselves (genres, platforms, languages); creatives can target them" },
  { version: "0019", file: "0019_game_icon_and_placement_stats.sql", summary: "A game's icon; impressions per day for chosen placements" },
  { version: "0020", file: "0020_own_creatives.sql", summary: "A developer's own creatives (up to 5 per placement), kept apart from advertisers'; own views counted separately" },
  { version: "0021", file: "0021_placement_organization.sql", summary: "Placement places (scene and path), folders, tags, on/off switches, place type, views per place" },
  { version: "0022", file: "0022_game_performance.sql", summary: "Game performance: views and distinct sessions per placement scope, split into advertisers and own creatives" },
  { version: "0023", file: "0023_game_ad_controls.sql", summary: "Pause and block campaigns, creatives, advertisers and categories game by game; change log; views per creative" },
  { version: "0024", file: "0024_digest_signal_disputes.sql", summary: "SDK last signal, since-your-last-visit summary, reports about creatives (Disputes)" },
  { version: "0025", file: "0025_placement_order.sql", summary: "Own order of placements inside a folder (drag between two cards)" },
  { version: "0026", file: "0026_campaign_rules.sql", summary: "Campaign audience, pause, draft plan and games a campaign skips" },
  { version: "0027", file: "0027_advertiser_daily_split.sql", summary: "Impressions per day split by creative and placement (Overview chart breakdowns)" },
  { version: "0028", file: "0028_cabinet_redesign.sql", summary: "Creative folders and order, framing per ad shape, pause until a date" },
  { version: "0029", file: "0029_game_cover.sql", summary: "The header picture of a game's card on My games" },
  { version: "0030", file: "0030_account_profile.sql", summary: "Account page: profile fields, notification choices, own sessions, email kept in step with sign-in" },
  { version: "0031", file: "0031_game_about.sql", summary: "A game's short description, store link, devices and play modes" },
  { version: "0032", file: "0032_unique_players.sql", summary: "Anonymous install ID on impressions; unique players in game Performance and advertiser totals" },
  { version: "0033", file: "0033_session_starts.sql", summary: "Sessions announced by the SDK; impressions per session over every session of a game" },
  { version: "0034", file: "0034_player_context.sql", summary: "Platform, device, system, language and country of each session; audience breakdowns for developers and advertisers" },
  { version: "0035", file: "0035_visibility_attention.sql", summary: "View distance, angle and screen share per impression; chances to be seen; attention figures for developers and advertisers" },
  { version: "0036", file: "0036_interactions.sql", summary: "Interactive placements and touches per view; interaction rate for developers and advertisers" },
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
