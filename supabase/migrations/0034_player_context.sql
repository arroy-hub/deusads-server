-- DeusADS 0034 — player context: platform, device, system, language and country of each session
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0033 (game_sessions) and 0010 (advertiser reports).
--
--   game_sessions            gains platform (a family: quest, pico, windows, ...), device_model, os, language,
--                            app_version and country (two letters, worked out by the server from the request).
--                            The SDK (0.11+) sends the first five when a session starts. The IP address is not
--                            stored, there is no city, and nothing here identifies a person.
--
--   game_audience()          for the developer: per value of one dimension, the game's announced sessions, its
--                            players, the advertisers' views in those sessions and how long they were seen.
--   advertiser_audience()    for the advertiser: the same split over his impressions only.
--
-- dimension is one of: platform, device, os, language, country. Sessions announced before this migration, and
-- sessions of older SDKs, have no value and are listed as "Unknown". Until it is applied the dashboards work and
-- simply show no audience panel.

alter table public.game_sessions add column if not exists platform     text;
alter table public.game_sessions add column if not exists device_model text;
alter table public.game_sessions add column if not exists os           text;
alter table public.game_sessions add column if not exists language     text;
alter table public.game_sessions add column if not exists app_version  text;
alter table public.game_sessions add column if not exists country      text;

drop function if exists public.game_audience(uuid, date, date, text);

create function public.game_audience(
    p_game_id   uuid,
    p_from      date,
    p_to        date,
    p_dimension text
)
returns table (
    value          text,
    sessions       bigint,
    players        bigint,
    views          bigint,
    own_views      bigint,
    visible_seconds numeric,
    visible_n      bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    s as (
        select gs.session_id,
               gs.install_id,
               case p_dimension
                   when 'platform' then gs.platform
                   when 'device'   then gs.device_model
                   when 'os'       then gs.os
                   when 'language' then gs.language
                   when 'country'  then gs.country
               end as v
        from public.game_sessions gs
        cross join bounds b
        where gs.game_id = p_game_id
          and p_dimension in ('platform', 'device', 'os', 'language', 'country')
          and gs.started_at >= (b.lo::timestamp at time zone 'utc')
          and gs.started_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    ),
    per_session as (
        select s.v, count(*) as sessions, count(distinct s.install_id) as players
        from s
        group by s.v
    ),
    views as (
        select s.v,
               count(*) filter (where not coalesce(i.own, false))                          as views,
               count(*) filter (where coalesce(i.own, false))                              as own_views,
               coalesce(sum(i.visible_seconds) filter (where not coalesce(i.own, false)), 0) as visible_seconds,
               count(i.visible_seconds) filter (where not coalesce(i.own, false))          as visible_n
        from s
        join public.impressions i
          on i.game_id = p_game_id and i.session_id = s.session_id
        group by s.v
    )
    select p.v,
           p.sessions,
           p.players,
           coalesce(w.views, 0),
           coalesce(w.own_views, 0),
           coalesce(w.visible_seconds, 0),
           coalesce(w.visible_n, 0)
    from per_session p
    left join views w on w.v is not distinct from p.v
    order by p.sessions desc, p.v nulls last
    limit 200;
$$;

revoke execute on function public.game_audience(uuid, date, date, text) from public, anon;
grant execute on function public.game_audience(uuid, date, date, text) to authenticated, service_role;

drop function if exists public.advertiser_audience(uuid, integer, uuid, text);

create function public.advertiser_audience(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null,
    p_dimension  text default 'platform'
) returns table (
    value          text,
    sessions       bigint,
    players        bigint,
    views          bigint,
    visible_seconds numeric,
    visible_n      bigint
)
language sql
stable
set search_path = public
as $$
    select x.v,
           count(distinct x.session_id)::bigint,
           count(distinct x.install_id)::bigint,
           count(*)::bigint,
           coalesce(sum(x.visible_seconds), 0),
           count(x.visible_seconds)::bigint
    from (
        select i.session_id,
               i.install_id,
               i.visible_seconds,
               case p_dimension
                   when 'platform' then gs.platform
                   when 'device'   then gs.device_model
                   when 'os'       then gs.os
                   when 'language' then gs.language
                   when 'country'  then gs.country
               end as v
        from public.impressions i
        join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
        left join public.game_sessions gs on gs.game_id = i.game_id and gs.session_id = i.session_id
        where p_dimension in ('platform', 'device', 'os', 'language', 'country')
          and i.occurred_at >= (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc'
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    ) x
    group by x.v
    order by count(*) desc, x.v nulls last
    limit 200;
$$;

revoke execute on function public.advertiser_audience(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.advertiser_audience(uuid, integer, uuid, text) to service_role;

insert into public.schema_versions (version, name)
values ('0034', '0034_player_context')
on conflict (version) do nothing;
