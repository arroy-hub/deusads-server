-- DeusADS 0040 — suspicious traffic: rules that flag impressions for an admin to look at
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0035 (view angle) and 0032 (the anonymous install ID).
--
-- Nothing is added to the tables and nothing is hidden or removed: these functions only read impressions and say which
-- ones look wrong. Every figure in the dashboards stays as it is; an admin looks at the flags and decides what to do.
-- Views of the developer's own creatives are never flagged. Only the last 90 days can be looked at.
--
-- Rules (an impression can break several):
--   future      the SDK stamped the view more than 10 minutes after the moment it reached the server
--   stale       the SDK stamped it more than 7 days before it reached the server
--   too_long    one view of one banner lasting more than 30 minutes
--   no_time     no length at all, or a length of zero
--   behind      seen at 90 degrees or more off head-on (from the side or the back of the banner)
--   session     one of more than 500 views in one session
--   player      one of more than 150 views of the same creative by one player in one day
--
--   traffic_flagged()    the flagged impressions: id, game and the rules each one breaks
--   traffic_by_game()    per game: views and flagged views, and how many broke each rule (admin only)
--   traffic_samples()    the latest flagged impressions of one game, with what they look like (admin only)

drop function if exists public.traffic_flagged(integer, uuid);

create function public.traffic_flagged(
    p_days integer default 30,
    p_game uuid    default null
)
returns table (
    id      bigint,
    game_id uuid,
    rules   text[]
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 90) - 1)) at time zone 'utc' as t
    ),
    v as (
        select i.id,
               i.game_id,
               i.occurred_at,
               i.received_at,
               i.visible_seconds,
               i.view_angle,
               i.view_distance,
               count(*) over (partition by i.game_id, i.session_id) as in_session,
               case when i.install_id is not null and i.creative_id is not null
                    then count(*) over (partition by i.game_id, i.install_id, i.creative_id, (i.occurred_at at time zone 'utc')::date)
               end as by_player_day
        from public.impressions i
        cross join since s
        where not coalesce(i.own, false)
          and i.received_at >= s.t
          and (p_game is null or i.game_id = p_game)
    ),
    r as (
        select v.id,
               v.game_id,
               array_remove(array[
                   case when v.occurred_at > v.received_at + interval '10 minutes' then 'future' end,
                   case when v.occurred_at < v.received_at - interval '7 days' then 'stale' end,
                   case when v.visible_seconds > 1800 then 'too_long' end,
                   case when v.visible_seconds is null or v.visible_seconds <= 0 then 'no_time' end,
                   case when v.view_distance is not null and v.view_angle >= 90 then 'behind' end,
                   case when v.in_session > 500 then 'session' end,
                   case when v.by_player_day > 150 then 'player' end
               ], null) as rules
        from v
    )
    select r.id, r.game_id, r.rules
    from r
    where cardinality(r.rules) > 0;
$$;

revoke execute on function public.traffic_flagged(integer, uuid) from public, anon, authenticated;
grant execute on function public.traffic_flagged(integer, uuid) to service_role;

drop function if exists public.traffic_by_game(integer);

create function public.traffic_by_game(
    p_days integer default 30
)
returns table (
    game_id   uuid,
    game_name text,
    views     bigint,
    flagged   bigint,
    future    bigint,
    stale     bigint,
    too_long  bigint,
    no_time   bigint,
    behind    bigint,
    session   bigint,
    player    bigint
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 90) - 1)) at time zone 'utc' as t
    ),
    totals as (
        select i.game_id, count(*) as views
        from public.impressions i
        cross join since s
        where not coalesce(i.own, false)
          and i.received_at >= s.t
        group by i.game_id
    ),
    f as (
        select t.game_id,
               count(*)                                          as flagged,
               count(*) filter (where 'future'   = any (t.rules)) as future,
               count(*) filter (where 'stale'    = any (t.rules)) as stale,
               count(*) filter (where 'too_long' = any (t.rules)) as too_long,
               count(*) filter (where 'no_time'  = any (t.rules)) as no_time,
               count(*) filter (where 'behind'   = any (t.rules)) as behind,
               count(*) filter (where 'session'  = any (t.rules)) as session,
               count(*) filter (where 'player'   = any (t.rules)) as player
        from public.traffic_flagged(p_days, null) t
        group by t.game_id
    )
    select t.game_id,
           g.name,
           t.views::bigint,
           coalesce(f.flagged, 0)::bigint,
           coalesce(f.future, 0)::bigint,
           coalesce(f.stale, 0)::bigint,
           coalesce(f.too_long, 0)::bigint,
           coalesce(f.no_time, 0)::bigint,
           coalesce(f.behind, 0)::bigint,
           coalesce(f.session, 0)::bigint,
           coalesce(f.player, 0)::bigint
    from totals t
    left join f on f.game_id = t.game_id
    left join public.games g on g.id = t.game_id
    order by coalesce(f.flagged, 0) desc, t.views desc
    limit 500;
$$;

revoke execute on function public.traffic_by_game(integer) from public, anon, authenticated;
grant execute on function public.traffic_by_game(integer) to service_role;

drop function if exists public.traffic_samples(uuid, integer, integer);

create function public.traffic_samples(
    p_game  uuid,
    p_days  integer default 30,
    p_limit integer default 50
)
returns table (
    id              bigint,
    occurred_at     timestamptz,
    received_at     timestamptz,
    session_id      text,
    install_id      text,
    placement       text,
    visible_seconds numeric,
    view_distance   numeric,
    view_angle      numeric,
    rules           text[]
)
language sql
stable
set search_path = public
as $$
    select i.id,
           i.occurred_at,
           i.received_at,
           i.session_id,
           i.install_id,
           coalesce(p.label, p.external_id),
           i.visible_seconds,
           i.view_distance,
           i.view_angle,
           t.rules
    from public.traffic_flagged(p_days, p_game) t
    join public.impressions i on i.id = t.id
    left join public.placements p on p.id = i.placement_id
    order by i.received_at desc, i.id desc
    limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.traffic_samples(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.traffic_samples(uuid, integer, integer) to service_role;

insert into public.schema_versions (version, name)
values ('0040', '0040_suspicious_traffic')
on conflict (version) do nothing;
