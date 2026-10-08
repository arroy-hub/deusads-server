-- DeusADS 0005 — RLS and index performance
--
-- APPLIED (via ALTER POLICY: the Supabase MCP tool blocks DROP POLICY, and ALTER
-- POLICY changes the expressions in place without it). Safe to run again.
-- Behaviour is unchanged; this only makes the database cheaper to query as the
-- tables grow.
--
--   1. RLS policies called auth.uid() once per row; (select auth.uid()) makes
--      Postgres evaluate it once per query.
--   2. Foreign keys without a covering index (performance advisor).
--
-- Policy names and commands stay as they were (accounts_self is still FOR ALL;
-- what users may change on accounts is limited by the column grants of 0004).

alter policy accounts_self on public.accounts
    using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy games_owner on public.games
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy placements_owner on public.placements
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy creatives_owner on public.creatives
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy assignments_owner on public.assignments
    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy impressions_owner_read on public.impressions
    using (owner_id = (select auth.uid()));

create index if not exists assignments_creative_idx  on public.assignments (creative_id);
create index if not exists assignments_owner_idx     on public.assignments (owner_id);
create index if not exists impressions_creative_idx  on public.impressions (creative_id);
create index if not exists impressions_owner_idx     on public.impressions (owner_id);
create index if not exists impressions_placement_idx on public.impressions (placement_id);
create index if not exists placements_owner_idx      on public.placements (owner_id);
