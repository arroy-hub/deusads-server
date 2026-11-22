-- DeusADS 0060 - the widgets of a game's Performance tab follow the placements chosen above them
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0057 (viewable impressions), 0041 (impression context), 0039 (frequency) and 0034 (player context).
--
-- The figures and the chart of the Performance tab count the placements that pass the filters and the ticks in the
-- table. The widgets under them ("Same selection as the chart") counted the whole game. These functions get one more
-- argument, p_members: the same list game_performance() takes for a scope,
--     [{ "placement": uuid, "place": uuid (optional), "unplaced": true (optional) }, ...]
-- and count only views (and chances to be seen) on those placements. null, the default, is the whole game, so every
-- caller that does not pass it (My games -> Performance, older code) gets what it got before.
--
--   game_attention()   views and chances to be seen on the chosen placements
--   game_frequency()   how many of those views each player saw
--   game_fatigue()     the repeat of a creative is still counted over the whole game (the 3rd time a player sees it is
--                      the 3rd time wherever it hangs); only views on the chosen placements are reported
--   game_context()     scene and minute of the views on the chosen placements
--   game_audience()    only the sessions that had a view on the chosen placements, and those views
--
-- Until this is applied the code asks the old way whenever nothing is chosen, and with a choice the widgets that need
-- these functions are left out, as with any missing migration.

drop function if exists public.game_attention(uuid, date, date, text);
drop function if exists public.game_attention(uuid, date, date, text, jsonb);

create function public.game_attention(
    p_game_id uuid,
    p_from    date,
    p_to      date,
    p_source  text default 'adv',
    p_members jsonb default null
)
returns table (
    measured       bigint,
    opportunities  bigint,
    avg_distance   numeric,
    avg_fraction   numeric,
    avg_angle      numeric,
    median_seconds numeric,
    under_2        bigint,
    from_2_to_5    bigint,
    from_5_to_10   bigint,
    over_10        bigint,
    engaged        bigint,
    viewable       bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    mem as (
        select (e ->> 'placement')::uuid                    as placement_id,
               nullif(e ->> 'place', '')::uuid              as place_id,
               coalesce((e ->> 'unplaced')::boolean, false) as unplaced
        from jsonb_array_elements(case when jsonb_typeof(p_members) = 'array' then p_members else '[]'::jsonb end) e
    ),
    m as (
        select i.visible_seconds, i.view_distance, i.screen_fraction, i.view_angle, i.viewable
        from public.impressions i
        cross join bounds b
        where i.game_id = p_game_id
          and (case coalesce(p_source, 'adv') when 'all' then true when 'own' then coalesce(i.own, false) else not coalesce(i.own, false) end)
          and i.view_distance is not null
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
          and (p_members is null or exists (
                select 1 from mem
                where mem.placement_id = i.placement_id
                  and case when mem.place_id is not null then i.place_id = mem.place_id
                           when mem.unplaced             then i.place_id is null
                           else true end))
    ),
    o as (
        select coalesce(sum(a.opportunities), 0)::bigint as n
        from public.ad_opportunities a
        cross join bounds b
        where a.game_id = p_game_id
          and (case coalesce(p_source, 'adv') when 'all' then true when 'own' then a.own else not a.own end)
          and a.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and a.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
          and (p_members is null or exists (
                select 1 from mem
                where mem.placement_id = a.placement_id
                  and case when mem.place_id is not null then a.place_id = mem.place_id
                           when mem.unplaced             then a.place_id is null
                           else true end))
    )
    select count(*)::bigint,
           (select n from o),
           round(avg(m.view_distance), 2),
           round(avg(m.screen_fraction), 4),
           round(avg(m.view_angle), 1),
           round((percentile_cont(0.5) within group (order by m.visible_seconds))::numeric, 2),
           count(*) filter (where m.visible_seconds <  2)::bigint,
           count(*) filter (where m.visible_seconds >= 2 and m.visible_seconds < 5)::bigint,
           count(*) filter (where m.visible_seconds >= 5 and m.visible_seconds < 10)::bigint,
           count(*) filter (where m.visible_seconds >= 10)::bigint,
           count(*) filter (where m.visible_seconds >= 3 and m.view_distance <= 3)::bigint,
           count(*) filter (where m.viewable)::bigint
    from m;
$$;

revoke execute on function public.game_attention(uuid, date, date, text, jsonb) from public, anon;
grant execute on function public.game_attention(uuid, date, date, text, jsonb) to authenticated, service_role;

drop function if exists public.game_frequency(uuid, date, date);
drop function if exists public.game_frequency(uuid, date, date, jsonb);

create function public.game_frequency(
    p_game_id uuid,
    p_from    date,
    p_to      date,
    p_members jsonb default null
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
    mem as (
        select (e ->> 'placement')::uuid                    as placement_id,
               nullif(e ->> 'place', '')::uuid              as place_id,
               coalesce((e ->> 'unplaced')::boolean, false) as unplaced
        from jsonb_array_elements(case when jsonb_typeof(p_members) = 'array' then p_members else '[]'::jsonb end) e
    ),
    v as (
        select i.install_id
        from public.impressions i
        cross join bounds b
        where i.game_id = p_game_id
          and not coalesce(i.own, false)
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
          and (p_members is null or exists (
                select 1 from mem
                where mem.placement_id = i.placement_id
                  and case when mem.place_id is not null then i.place_id = mem.place_id
                           when mem.unplaced             then i.place_id is null
                           else true end))
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

revoke execute on function public.game_frequency(uuid, date, date, jsonb) from public, anon;
grant execute on function public.game_frequency(uuid, date, date, jsonb) to authenticated, service_role;

drop function if exists public.game_fatigue(uuid, date, date);
drop function if exists public.game_fatigue(uuid, date, date, jsonb);

create function public.game_fatigue(
    p_game_id uuid,
    p_from    date,
    p_to      date,
    p_members jsonb default null
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
    mem as (
        select (e ->> 'placement')::uuid                    as placement_id,
               nullif(e ->> 'place', '')::uuid              as place_id,
               coalesce((e ->> 'unplaced')::boolean, false) as unplaced
        from jsonb_array_elements(case when jsonb_typeof(p_members) = 'array' then p_members else '[]'::jsonb end) e
    ),
    ranked as (
        select i.occurred_at,
               i.visible_seconds,
               i.view_distance,
               i.placement_id,
               i.place_id,
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
      and (p_members is null or exists (
            select 1 from mem
            where mem.placement_id = r.placement_id
              and case when mem.place_id is not null then r.place_id = mem.place_id
                       when mem.unplaced             then r.place_id is null
                       else true end))
    group by 1;
$$;

revoke execute on function public.game_fatigue(uuid, date, date, jsonb) from public, anon;
grant execute on function public.game_fatigue(uuid, date, date, jsonb) to authenticated, service_role;

drop function if exists public.game_context(uuid, date, date, text);
drop function if exists public.game_context(uuid, date, date, text, jsonb);

create function public.game_context(
    p_game_id   uuid,
    p_from      date,
    p_to        date,
    p_dimension text default 'minute',
    p_members   jsonb default null
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
    mem as (
        select (e ->> 'placement')::uuid                    as placement_id,
               nullif(e ->> 'place', '')::uuid              as place_id,
               coalesce((e ->> 'unplaced')::boolean, false) as unplaced
        from jsonb_array_elements(case when jsonb_typeof(p_members) = 'array' then p_members else '[]'::jsonb end) e
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
          and (p_members is null or exists (
                select 1 from mem
                where mem.placement_id = i.placement_id
                  and case when mem.place_id is not null then i.place_id = mem.place_id
                           when mem.unplaced             then i.place_id is null
                           else true end))
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

revoke execute on function public.game_context(uuid, date, date, text, jsonb) from public, anon;
grant execute on function public.game_context(uuid, date, date, text, jsonb) to authenticated, service_role;

drop function if exists public.game_audience(uuid, date, date, text);
drop function if exists public.game_audience(uuid, date, date, text, jsonb);

create function public.game_audience(
    p_game_id   uuid,
    p_from      date,
    p_to        date,
    p_dimension text,
    p_members   jsonb default null
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
    mem as (
        select (e ->> 'placement')::uuid                    as placement_id,
               nullif(e ->> 'place', '')::uuid              as place_id,
               coalesce((e ->> 'unplaced')::boolean, false) as unplaced
        from jsonb_array_elements(case when jsonb_typeof(p_members) = 'array' then p_members else '[]'::jsonb end) e
    ),
    -- the views that count: every view of the game, or with p_members only those on the chosen placements
    hits as (
        select i.session_id, coalesce(i.own, false) as own, i.visible_seconds
        from public.impressions i
        where i.game_id = p_game_id
          and (p_members is null or exists (
                select 1 from mem
                where mem.placement_id = i.placement_id
                  and case when mem.place_id is not null then i.place_id = mem.place_id
                           when mem.unplaced             then i.place_id is null
                           else true end))
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
          and (p_members is null or exists (select 1 from hits h where h.session_id = gs.session_id))
    ),
    per_session as (
        select s.v, count(*) as sessions, count(distinct s.install_id) as players
        from s
        group by s.v
    ),
    views as (
        select s.v,
               count(*) filter (where not h.own)                          as views,
               count(*) filter (where h.own)                              as own_views,
               coalesce(sum(h.visible_seconds) filter (where not h.own), 0) as visible_seconds,
               count(h.visible_seconds) filter (where not h.own)          as visible_n
        from s
        join hits h on h.session_id = s.session_id
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

revoke execute on function public.game_audience(uuid, date, date, text, jsonb) from public, anon;
grant execute on function public.game_audience(uuid, date, date, text, jsonb) to authenticated, service_role;

insert into public.schema_versions (version, name)
values ('0060', '0060_widget_selection')
on conflict (version) do nothing;
