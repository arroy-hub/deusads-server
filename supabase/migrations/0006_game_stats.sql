-- DeusADS 0006 — exact impression and session counts per game
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
--
-- The game page used to read impression rows and count sessions in code;
-- PostgREST returns at most 1000 rows, so once a game passed 1000 impressions
-- its session count was too low. This counts in the database.
--
-- security invoker: the caller's row-level security still applies, so a user
-- only ever counts their own impressions. Until this is applied the dashboard
-- falls back to the old read and marks the session count with a "+".

create or replace function public.game_stats(p_game_id uuid)
returns table (impressions bigint, sessions bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select count(*)::bigint, count(distinct session_id)::bigint
    from public.impressions
    where game_id = p_game_id;
$$;

revoke execute on function public.game_stats(uuid) from public, anon;
grant execute on function public.game_stats(uuid) to authenticated;
