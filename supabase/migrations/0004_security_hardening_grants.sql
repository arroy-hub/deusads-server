-- DeusADS 0004 — security hardening (grants)
--
-- ALREADY APPLIED to the "Creatives" project on 2026-10-09 (recorded there as
-- 0004_security_hardening_grants). Safe to run again on any other database.
--
-- What this closes (Supabase security advisor + manual review):
--   1. impression_daily ran with its owner's rights and was readable by anon, so
--      anyone holding the public anon key could read every owner's daily totals.
--   2. A signed-in user could change their own accounts.role (e.g. to 'admin') and
--      their own creatives.status (e.g. 'pending' -> 'approved'), because the
--      owner policies allow updating any column of the user's own rows.
--   3. handle_new_user() was callable as an RPC by anon and signed-in users.
--   4. anon held full table privileges on every public table (RLS was the only gate).
--
-- Nothing here changes what the dashboard or the /v1 routes do: the dashboard
-- reads and writes as 'authenticated' and the SDK routes use the service role.
-- The dashboard never updates accounts or creatives, and inserts creatives with
-- exactly the columns granted below.

-- 1. impression_daily: evaluate with the caller's rights, no anon access.
alter view public.impression_daily set (security_invoker = true);
revoke all on public.impression_daily from anon, authenticated;
grant select on public.impression_daily to authenticated;

-- 4. anon needs nothing on these tables (dashboard uses the user session, SDK uses service role).
revoke all on public.accounts, public.games, public.placements,
              public.creatives, public.assignments, public.impressions
    from anon;

-- 2a. accounts: a user may edit only their company; role is not user-editable.
revoke insert, update, delete, truncate on public.accounts from authenticated;
grant update (company) on public.accounts to authenticated;

-- 2b. creatives: status is not user-editable (reserved for moderation / service role).
-- New rows still default to 'approved' until the moderation queue exists.
revoke insert, update on public.creatives from authenticated;
grant insert (owner_id, name, storage_path, width_px, height_px) on public.creatives to authenticated;
grant update (name) on public.creatives to authenticated;

-- 3. The sign-up trigger still fires: trigger functions are checked for EXECUTE
-- when the trigger is created, not each time it runs.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Not SQL: turn on "Leaked password protection" in Supabase → Authentication.
