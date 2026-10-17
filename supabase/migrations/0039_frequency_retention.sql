-- DeusADS 0039 — frequency, creative fatigue, retention and daily players
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0033 (game_sessions) and 0032 (the anonymous install ID on impressions and sessions).
--
-- Nothing is added to the tables; these functions only read what is there. A player is an anonymous install ID, so
-- views and sessions from SDKs before 0.9 / 0.10 (which sent none) are left out of every figure below, or counted
-- apart where it matters.
--
--   game_frequency()          developer: how many of the advertisers' ads each player saw in the period, as buckets
--   advertiser_frequency()    advertiser: the same for his ads (or one campaign)
--                             buckets v1, v2, v3, v4_5, v6_10, v11 = players who saw 1, 2, 3, 4-5, 6-10, 11+ ads;
--                             untracked = views without a player ID (players 0)
--   game_fatigue()            developer: does attention fall when the same player sees the same creative again?
--   advertiser_fatigue()      advertiser: the same for his creatives (or one campaign)
--                             one row per exposure: e1 the first time a player sees a creative, e2, e3, e4_5, e6 = 6th and
--                             later. views = all views; measured = views from SDK 0.11+ that carry a length;
--                             visible_seconds = their total length; engaged = 3 s or more from 3 m or closer.
--   game_retention()          developer: of the players first seen in each day of the period, how many came back
--                             on day 1, 7 and 30 after (a session on exactly that day). A player is new on the day of
--                             his first session the SDK announced; players who were already playing when the SDK
--                             started announcing sessions look new on their first announced day.
--   game_dau()                developer: players, sessions and new players per day.

drop function if exists public.game_frequency(uuid, date, date);

create function public.game_frequency(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (
    bucket  text,
    players bigint,
    views   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    v as (
        select i.install_id
        from public.impressions i
        cross join bounds b
        where i.game_id = p_game_id
          and not coalesce(i.own, false)
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    ),
    per_player as (
        select v.install_id, count(*) as n
        from v
        where v.install_id is not null
        group by v.install_id
    )
    select case when p.n = 1 then 'v1'
                when p.n = 2 then 'v2'
                when p.n = 3 then 'v3'
                when p.n <= 5 then 'v4_5'
                when p.n <= 10 then 'v6_10'
                else 'v11' end,
           count(*)::bigint,
           sum(p.n)::bigint
    from per_player p
    group by 1
    union all
    select 'untracked', 0::bigint, count(*)::bigint
    from v
    where v.install_id is null
    having count(*) > 0;
$$;

revoke execute on function public.game_frequency(uuid, date, date) from public, anon;
grant execute on function public.game_frequency(uuid, date, date) to authenticated, service_role;

drop function if exists public.advertiser_frequency(uuid, integer, uuid);

create function public.advertiser_frequency(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null
)
returns table (
    bucket  text,
    players bigint,
    views   bigint
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc' as t
    ),
    v as (
        select i.install_id
        from public.impressions i
        join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
        cross join since s
        where i.occurred_at >= s.t
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    ),
    per_player as (
        select v.install_id, count(*) as n
        from v
        where v.install_id is not null
        group by v.install_id
    )
    select case when p.n = 1 then 'v1'
                when p.n = 2 then 'v2'
                when p.n = 3 then 'v3'
                when p.n <= 5 then 'v4_5'
                when p.n <= 10 then 'v6_10'
                else 'v11' end,
           count(*)::bigint,
           sum(p.n)::bigint
    from per_player p
    group by 1
    union all
    select 'untracked', 0::bigint, count(*)::bigint
    from v
    where v.install_id is null
    having count(*) > 0;
$$;

revoke execute on function public.advertiser_frequency(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_frequency(uuid, integer, uuid) to service_role;

drop function if exists public.game_fatigue(uuid, date, date);

create function public.game_fatigue(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (
    exposure        text,
    views           bigint,
    measured        bigint,
    visible_seconds numeric,
    engaged         bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    ranked as (
        select i.occurred_at,
               i.visible_seconds,
               i.view_distance,
               row_number() over (partition by i.install_id, i.creative_id order by i.occurred_at, i.id) as n
        from public.impressions i
        cross join bounds b
        where i.game_id = p_game_id
          and not coalesce(i.own, false)
          and i.install_id is not null
          and i.creative_id is not null
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    )
    select case when r.n = 1 then 'e1'
                when r.n = 2 then 'e2'
                when r.n = 3 then 'e3'
                when r.n <= 5 then 'e4_5'
                else 'e6' end,
           count(*)::bigint,
           (count(*) filter (where r.view_distance is not null))::bigint,
           coalesce(sum(r.visible_seconds) filter (where r.view_distance is not null), 0),
           (count(*) filter (where r.view_distance is not null and r.visible_seconds >= 3 and r.view_distance <= 3))::bigint
    from ranked r
    cross join bounds b
    where r.occurred_at >= (b.lo::timestamp at time zone 'utc')
    group by 1;
$$;

revoke execute on function public.game_fatigue(uuid, date, date) from public, anon;
grant execute on function public.game_fatigue(uuid, date, date) to authenticated, service_role;

drop function if exists public.advertiser_fatigue(uuid, integer, uuid);

create function public.advertiser_fatigue(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null
)
returns table (
    exposure        text,
    views           bigint,
    measured        bigint,
    visible_seconds numeric,
    engaged         bigint
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc' as t
    ),
    ranked as (
        select i.occurred_at,
               i.placement_id,
               i.creative_id,
               i.visible_seconds,
               i.view_distance,
               row_number() over (partition by i.install_id, i.creative_id order by i.occurred_at, i.id) as n
        from public.impressions i
        join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
        where i.install_id is not null
    )
    select case when r.n = 1 then 'e1'
                when r.n = 2 then 'e2'
                when r.n = 3 then 'e3'
                when r.n <= 5 then 'e4_5'
                else 'e6' end,
           count(*)::bigint,
           (count(*) filter (where r.view_distance is not null))::bigint,
           coalesce(sum(r.visible_seconds) filter (where r.view_distance is not null), 0),
           (count(*) filter (where r.view_distance is not null and r.visible_seconds >= 3 and r.view_distance <= 3))::bigint
    from ranked r
    cross join since s
    where r.occurred_at >= s.t
      and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = r.creative_id and b.placement_id = r.placement_id))
    group by 1;
$$;

revoke execute on function public.advertiser_fatigue(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_fatigue(uuid, integer, uuid) to service_role;

drop function if exists public.game_retention(uuid, date, date);

create function public.game_retention(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (
    cohort  date,
    players bigint,
    d1      bigint,
    d7      bigint,
    d30     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    firsts as (
        select gs.install_id,
               min((gs.started_at at time zone 'utc')::date) as d0
        from public.game_sessions gs
        where gs.game_id = p_game_id
          and gs.install_id is not null
        group by gs.install_id
    ),
    cohort as (
        select f.install_id, f.d0
        from firsts f
        cross join bounds b
        where f.d0 between b.lo and b.hi
    ),
    active as (
        select distinct gs.install_id,
               (gs.started_at at time zone 'utc')::date as d
        from public.game_sessions gs
        cross join bounds b
        where gs.game_id = p_game_id
          and gs.install_id is not null
          and gs.started_at >= ((b.lo + 1)::timestamp at time zone 'utc')
    )
    select c.d0,
           count(distinct c.install_id)::bigint,
           (count(distinct c.install_id) filter (where a.d = c.d0 + 1))::bigint,
           (count(distinct c.install_id) filter (where a.d = c.d0 + 7))::bigint,
           (count(distinct c.install_id) filter (where a.d = c.d0 + 30))::bigint
    from cohort c
    left join active a
           on a.install_id = c.install_id
          and a.d in (c.d0 + 1, c.d0 + 7, c.d0 + 30)
    group by c.d0
    order by c.d0;
$$;

revoke execute on function public.game_retention(uuid, date, date) from public, anon;
grant execute on function public.game_retention(uuid, date, date) to authenticated, service_role;

drop function if exists public.game_dau(uuid, date, date);

create function public.game_dau(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (
    day         date,
    players     bigint,
    sessions    bigint,
    new_players bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    firsts as (
        select gs.install_id,
               min((gs.started_at at time zone 'utc')::date) as d0
        from public.game_sessions gs
        where gs.game_id = p_game_id
          and gs.install_id is not null
        group by gs.install_id
    ),
    s as (
        select (gs.started_at at time zone 'utc')::date as d,
               gs.install_id
        from public.game_sessions gs
        cross join bounds b
        where gs.game_id = p_game_id
          and gs.started_at >= (b.lo::timestamp at time zone 'utc')
          and gs.started_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    )
    select s.d,
           count(distinct s.install_id)::bigint,
           count(*)::bigint,
           count(distinct f.install_id)::bigint
    from s
    left join firsts f on f.install_id = s.install_id and f.d0 = s.d
    group by s.d
    order by s.d;
$$;

revoke execute on function public.game_dau(uuid, date, date) from public, anon;
grant execute on function public.game_dau(uuid, date, date) to authenticated, service_role;

insert into public.schema_versions (version, name)
values ('0039', '0039_frequency_retention')
on conflict (version) do nothing;
