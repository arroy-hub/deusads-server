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
  { version: "0037", file: "0037_fill_rate.sql", summary: "Fill rate: placements that got an ad when the game started and why the others stayed empty" },
  { version: "0038", file: "0038_sdk_performance.sql", summary: "SDK performance: frame rate, stutters, creative load time and SDK errors per session; developer only" },
  { version: "0039", file: "0039_frequency_retention.sql", summary: "Ad frequency per player, creative fatigue, retention (day 1, 7, 30) and players per day" },
  { version: "0040", file: "0040_suspicious_traffic.sql", summary: "Rules that mark suspicious impressions (marks only, nothing hidden) and an admin Traffic page" },
  { version: "0041", file: "0041_impression_context.sql", summary: "Views by scene and by minute of the session, with time seen and engaged views" },
  { version: "0042", file: "0042_dashboard_layouts.sql", summary: "The widget board remembers its layout in the account" },
  { version: "0043", file: "0043_campaign_compare.sql", summary: "A campaign compared by creative and by game: engaged, viewable, touched, players" },
  { version: "0044", file: "0044_campaign_cover.sql", summary: "A picture or colour behind a campaign's page and card" },
  { version: "0045", file: "0045_admin_cabinet.sql", summary: "Admin cabinet: boards, impressions per booking, disputes both ways, admin pause" },
  { version: "0046", file: "0046_dispute_notes.sql", summary: "Internal notes on a dispute (Add note on a dispute card)" },
  { version: "0047", file: "0047_creatives_always_reviewed.sql", summary: "Every new creative waits for review, whoever uploads it" },
  { version: "0048", file: "0048_campaign_category.sql", summary: "A campaign's own category (its icon), chosen when it is created" },
  { version: "0049", file: "0049_booking_schedule_cron.sql", summary: "The booking schedule runs every minute inside the database (pg_cron), not on a game's manifest request" },
  { version: "0050", file: "0050_game_countries.sql", summary: "Country targeting: the countries a game's audience lives in" },
  { version: "0051", file: "0051_placement_shape.sql", summary: "Placement shape: where the picture is too distorted to be shown" },
  { version: "0052", file: "0052_support.sql", summary: "Support: requests to the admin, messages, screenshots, folders, assistant data" },
  { version: "0053", file: "0053_support_guide_seed.sql", summary: "Support: the assistant's starting guide (only while the guide is empty)" },
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
