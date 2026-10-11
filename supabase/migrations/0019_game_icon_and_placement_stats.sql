-- DeusADS 0019 — a game's icon, and impressions per day for chosen placements
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0018 (and everything before it).
--
--   1. games.icon_path: where the developer's icon for the game lives in the `creatives` storage
--      bucket (inside the owner's own folder, like every file there). null means no icon: the
--      dashboard then shows the first letter of the game's name. The owner sets it through the
--      same row-level security as the rest of the game's columns.
--   2. game_daily_by_placement(game, days, placements): the same figures as game_daily(), counted
--      only for the placements given (null = all of them). The Performance tab uses it when the
--      developer picks placements to look at. Security invoker, like game_daily: a user only ever
--      aggregates their own impressions.
--
-- Until this is applied nothing breaks: games show a letter instead of an icon, and the
-- Performance chart keeps showing the whole game (the table can still be sorted).

alter table public.games
    add column if not exists icon_path text check (icon_path is null or char_length(icon_path) <= 300);

create or replace function public.game_daily_by_placement(
    p_game_id uuid,
    p_days integer default 30,
    p_placement_ids uuid[] default null
)
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
      and (p_placement_ids is null or i.placement_id = any (p_placement_ids))
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
    group by 1
    order by 1;
$$;

revoke execute on function public.game_daily_by_placement(uuid, integer, uuid[]) from public, anon;
grant execute on function public.game_daily_by_placement(uuid, integer, uuid[]) to authenticated;

insert into public.schema_versions (version, name)
values ('0019', '0019_game_icon_and_placement_stats')
on conflict (version) do nothing;
