-- DeusADS 0005 — RLS and index performance
--
-- NOT YET APPLIED. Run once in the Supabase SQL editor (the MCP tool blocks
-- DROP POLICY). Safe to run again. Behaviour is unchanged; this only makes the
-- database cheaper to query as the tables grow.
--
--   1. RLS policies called auth.uid() once per row; (select auth.uid()) makes
--      Postgres evaluate it once per query.
--   2. Foreign keys without a covering index (performance advisor).
--
-- Run 0004 first: accounts_self is split into read and update policies because
-- 0004 already limits what a user can update.

begin;

drop policy if exists accounts_self on public.accounts;
drop policy if exists accounts_self_update on public.accounts;
create policy accounts_self on public.accounts
    for select using (id = (select auth.uid()));
create policy accounts_self_update on public.accounts
    for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists games_owner on public.games;
create policy games_owner on public.games
    for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists placements_owner on public.placements;
create policy placements_owner on public.placements
    for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists creatives_owner on public.creatives;
create policy creatives_owner on public.creatives
    for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists assignments_owner on public.assignments;
create policy assignments_owner on public.assignments
    for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists impressions_owner_read on public.impressions;
create policy impressions_owner_read on public.impressions
    for select using (owner_id = (select auth.uid()));

create index if not exists assignments_creative_idx  on public.assignments (creative_id);
create index if not exists assignments_owner_idx     on public.assignments (owner_id);
create index if not exists impressions_creative_idx  on public.impressions (creative_id);
create index if not exists impressions_owner_idx     on public.impressions (owner_id);
create index if not exists impressions_placement_idx on public.impressions (placement_id);
create index if not exists placements_owner_idx      on public.placements (owner_id);

commit;
