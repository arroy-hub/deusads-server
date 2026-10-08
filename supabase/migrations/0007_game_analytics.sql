-- DeusADS 0007 — analytics for the game page
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
--
-- Two read-only functions that aggregate in the database, because PostgREST
-- returns at most 1000 rows and a busy game has far more impressions than that.
--
--   game_daily(game, days)            impressions and distinct sessions per UTC day
--   game_placement_stats(game, days)  the same per placement, plus mean visible time
--
-- Both are security invoker: the caller's row-level security still applies, so a
-- user only ever aggregates their own impressions. Days with no impressions are
-- absent from game_daily; the dashboard fills them in as zeros.
-- Until this is applied the dashboard simply leaves the analytics block out.

create or replace function public.game_daily(p_game_id uuid, p_days integer default 30)
returns table (day date, impressions bigint, sessions bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select
        (i.occurred_at at time zone 'utc')::date  as day,
        count(*)::bigint                          as impressions,
        count(distinct i.session_id)::bigint      as sessions
    from public.impressions i
    where i.game_id = p_game_id
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
    group by 1
    order by 1;
$$;

create or replace function public.game_placement_stats(p_game_id uuid, p_days integer default 30)
returns table (placement_id uuid, impressions bigint, sessions bigint, avg_visible_seconds numeric)
language sql
stable
security invoker
set search_path = public
as $$
    select
        i.placement_id,
        count(*)::bigint                          as impressions,
        count(distinct i.session_id)::bigint      as sessions,
        round(avg(i.visible_seconds), 2)          as avg_visible_seconds
    from public.impressions i
    where i.game_id = p_game_id
      and i.placement_id is not null
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
    group by i.placement_id
    order by count(*) desc;
$$;

revoke execute on function public.game_daily(uuid, integer) from public, anon;
revoke execute on function public.game_placement_stats(uuid, integer) from public, anon;
grant execute on function public.game_daily(uuid, integer) to authenticated;
grant execute on function public.game_placement_stats(uuid, integer) to authenticated;
