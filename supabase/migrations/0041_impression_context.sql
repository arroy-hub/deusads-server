-- DeusADS 0041 — where in the game and when in the session an ad was seen
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0033 (the start of each session), 0035 (how long and how close a view was) and 0021 (the place a view came from).
--
-- Nothing is added to the tables; these functions only read what is there, and the SDK sends nothing new. The scene is
-- the one the SDK named when it reported the view (SDK 0.6+): a game that has no levels has only its scenes.
--
--   game_context()           developer: his advertisers' views by scene (dimension scene) or by the minute of the session in
--                            which they were seen (dimension minute). One row per scene (the 40 with most views) or per
--                            minute bucket, with the views, how many carry a length (SDK 0.11+), their total length, and
--                            how many were engaged (3 s or more from 3 m or closer). A view with no known scene has a
--                            null bucket.
--   advertiser_context()     advertiser: the same by minute only, for his ads (or one campaign). The names of the
--                            scenes in a developer's game are the developer's own and are not shown to advertisers.
--
-- Minute buckets: m0 first minute, m1 second, m2_4 minutes 3-5, m5_9 minutes 6-10, m10_19 minutes 11-20, m20 after the
-- 20th, unknown = the session start was never announced (SDK before 0.10), or the view's time is more than 12 hours
-- from it, or a clock that is way off.

drop function if exists public.game_context(uuid, date, date, text);

create function public.game_context(
    p_game_id   uuid,
    p_from      date,
    p_to        date,
    p_dimension text default 'minute'
)
returns table (
    bucket          text,
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
    v as (
        select i.visible_seconds,
               i.view_distance,
               case p_dimension
                   when 'scene' then coalesce(nullif(pp.scene, ''), nullif(pl.scene, ''))
                   when 'minute' then
                       case
                           when gs.started_at is null then 'unknown'
                           when extract(epoch from (i.occurred_at - gs.started_at)) < -300 then 'unknown'
                           when extract(epoch from (i.occurred_at - gs.started_at)) >= 43200 then 'unknown'
                           when extract(epoch from (i.occurred_at - gs.started_at)) < 60 then 'm0'
                           when extract(epoch from (i.occurred_at - gs.started_at)) < 120 then 'm1'
                           when extract(epoch from (i.occurred_at - gs.started_at)) < 300 then 'm2_4'
                           when extract(epoch from (i.occurred_at - gs.started_at)) < 600 then 'm5_9'
                           when extract(epoch from (i.occurred_at - gs.started_at)) < 1200 then 'm10_19'
                           else 'm20'
                       end
               end as bucket
        from public.impressions i
        cross join bounds b
        left join public.placement_places pp on pp.id = i.place_id
        left join public.placements pl on pl.id = i.placement_id
        left join public.game_sessions gs on gs.game_id = i.game_id and gs.session_id = i.session_id
        where i.game_id = p_game_id
          and p_dimension in ('scene', 'minute')
          and not coalesce(i.own, false)
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    )
    select v.bucket,
           count(*)::bigint,
           (count(*) filter (where v.view_distance is not null))::bigint,
           coalesce(sum(v.visible_seconds) filter (where v.view_distance is not null), 0),
           (count(*) filter (where v.view_distance is not null and v.visible_seconds >= 3 and v.view_distance <= 3))::bigint
    from v
    group by v.bucket
    order by count(*) desc, v.bucket nulls last
    limit 40;
$$;

revoke execute on function public.game_context(uuid, date, date, text) from public, anon;
grant execute on function public.game_context(uuid, date, date, text) to authenticated, service_role;

drop function if exists public.advertiser_context(uuid, integer, uuid);

create function public.advertiser_context(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null
)
returns table (
    bucket          text,
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
    v as (
        select i.visible_seconds,
               i.view_distance,
               case
                   when gs.started_at is null then 'unknown'
                   when extract(epoch from (i.occurred_at - gs.started_at)) < -300 then 'unknown'
                   when extract(epoch from (i.occurred_at - gs.started_at)) >= 43200 then 'unknown'
                   when extract(epoch from (i.occurred_at - gs.started_at)) < 60 then 'm0'
                   when extract(epoch from (i.occurred_at - gs.started_at)) < 120 then 'm1'
                   when extract(epoch from (i.occurred_at - gs.started_at)) < 300 then 'm2_4'
                   when extract(epoch from (i.occurred_at - gs.started_at)) < 600 then 'm5_9'
                   when extract(epoch from (i.occurred_at - gs.started_at)) < 1200 then 'm10_19'
                   else 'm20'
               end as bucket
        from public.impressions i
        join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
        cross join since s
        left join public.game_sessions gs on gs.game_id = i.game_id and gs.session_id = i.session_id
        where i.occurred_at >= s.t
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    )
    select v.bucket,
           count(*)::bigint,
           (count(*) filter (where v.view_distance is not null))::bigint,
           coalesce(sum(v.visible_seconds) filter (where v.view_distance is not null), 0),
           (count(*) filter (where v.view_distance is not null and v.visible_seconds >= 3 and v.view_distance <= 3))::bigint
    from v
    group by v.bucket;
$$;

revoke execute on function public.advertiser_context(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_context(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0041', '0041_impression_context')
on conflict (version) do nothing;
