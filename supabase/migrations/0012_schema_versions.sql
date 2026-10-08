-- DeusADS 0012 — a record of which migrations this database has
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
--
-- Until now the only way to know whether a migration had been run was to look at the
-- database by hand. This table is that record: every migration file from 0012 on ends
-- with an insert into it, and the dashboard (Admin -> System) compares it with the
-- list of migrations the code expects (lib/migrations.js), so a database that is
-- behind the code is visible at a glance instead of showing up as an error.
--
-- 0001-0011 are backfilled below. All of them were checked against the live database
-- before this file was written (columns, functions, grants, policies and indexes each
-- one adds are present).
--
-- Only the dashboard's service role reads it; users and anon cannot.

create table if not exists public.schema_versions (
    version    text primary key check (version ~ '^[0-9]{4}$'),
    name       text not null,
    applied_at timestamptz not null default now()
);

alter table public.schema_versions enable row level security;
revoke all on public.schema_versions from public, anon, authenticated;
grant select, insert on public.schema_versions to service_role;

insert into public.schema_versions (version, name) values
    ('0001', '0001_init'),
    ('0002', '0002_placement_sync_and_events'),
    ('0003', '0003_assignment_crop'),
    ('0004', '0004_security_hardening_grants'),
    ('0005', '0005_rls_performance'),
    ('0006', '0006_game_stats'),
    ('0007', '0007_game_analytics'),
    ('0008', '0008_roles_and_moderation'),
    ('0009', '0009_campaigns_and_bookings'),
    ('0010', '0010_advertiser_reports'),
    ('0011', '0011_bookings_fk_indexes'),
    ('0012', '0012_schema_versions')
on conflict (version) do nothing;
