-- DeusADS 0022 — one flexible set of figures for the Performance tab
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0021 (and everything before it). Only adds two functions: nothing existing changes.
--
-- The Performance tab lets a developer look at any group of placements (a folder, a scene, a tag,
-- the ones ticked, or just one), for any period, with advertisers' views and the developer's own
-- pictures kept apart. Instead of one function per question this answers all of them:
--
--   game_performance(game, from, to, scopes, by_day)
--       scopes is a list of "scopes", each a set of views to count. A scope is either everything in
--       the game, or a list of members; a member names a placement and, optionally, one place of it:
--           { "key": "folder:abc",
--             "members": [ { "placement": "<uuid>" },                       every view of the placement
--                          { "placement": "<uuid>", "place": "<uuid>" },    views from that place only
--                          { "placement": "<uuid>", "unplaced": true } ] }  views with no place recorded
--           { "key": "all", "all": true }                                   every view of the game
--       A view that matches several members of one scope is counted once. Per scope it returns views
--       from advertisers and from the developer's own pictures, distinct sessions (all, advertisers,
--       own: sessions cannot be added up across scopes, so they are counted here), and visible time
--       (sum and count, so averages can be made of any mix). With by_day it also returns one row per
--       UTC day (day is null on the row that holds the scope's totals).
--
--   game_performance_creatives(game, from, to, members)
--       Views per creative (and whether it is the developer's own) for one set of members.
--
-- Both are security invoker: the caller's row-level security still applies, so a user only ever
-- aggregates their own impressions. A window is at most 366 days; `to` is included.
--
-- Until this is applied the Performance tab says so and shows nothing else; the rest of the
-- dashboard is not affected.

create or replace function public.game_performance(
    p_game_id  uuid,
    p_from     date,
    p_to       date,
    p_scopes   jsonb,
    p_by_day   boolean default false
)
returns table (
    scope_key        text,
    day              date,
    adv              bigint,
    own              bigint,
    sessions         bigint,
    adv_sessions     bigint,
    own_sessions     bigint,
    adv_visible      numeric,
    adv_visible_n    bigint,
    own_visible      numeric,
    own_visible_n    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    window_rows as (
        select i.id,
               i.placement_id,
               i.place_id,
               coalesce(i.own, false)                    as own,
               i.session_id,
               i.visible_seconds,
               (i.occurred_at at time zone 'utc')::date  as day
        from public.impressions i, bounds b
        where i.game_id = p_game_id
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    ),
    scopes as (
        select s ->> 'key'                                   as k,
               coalesce((s ->> 'all')::boolean, false)       as every,
               coalesce(s -> 'members', '[]'::jsonb)         as members
        from jsonb_array_elements(coalesce(p_scopes, '[]'::jsonb)) s
    ),
    members as (
        select sc.k,
               (m ->> 'placement')::uuid                     as placement_id,
               nullif(m ->> 'place', '')::uuid               as place_id,
               coalesce((m ->> 'unplaced')::boolean, false)  as unplaced
        from scopes sc, jsonb_array_elements(sc.members) m
        where not sc.every
    ),
    -- union (not union all): a view that several members of one scope match is one row
    hits as (
        select sc.k, w.id, w.own, w.session_id, w.visible_seconds, w.day
        from scopes sc
        join window_rows w on sc.every
        union
        select m.k, w.id, w.own, w.session_id, w.visible_seconds, w.day
        from members m
        join window_rows w
          on w.placement_id = m.placement_id
         and case
               when m.place_id is not null then w.place_id = m.place_id
               when m.unplaced             then w.place_id is null
               else true
             end
    )
    select h.k                                                        as scope_key,
           h.day                                                      as day,
           count(*) filter (where not h.own)                          as adv,
           count(*) filter (where h.own)                              as own,
           count(distinct h.session_id)                               as sessions,
           count(distinct h.session_id) filter (where not h.own)      as adv_sessions,
           count(distinct h.session_id) filter (where h.own)          as own_sessions,
           coalesce(sum(h.visible_seconds) filter (where not h.own), 0) as adv_visible,
           count(h.visible_seconds) filter (where not h.own)          as adv_visible_n,
           coalesce(sum(h.visible_seconds) filter (where h.own), 0)   as own_visible,
           count(h.visible_seconds) filter (where h.own)              as own_visible_n
    from hits h
    group by grouping sets ((h.k), (h.k, h.day))
    having p_by_day or grouping(h.day) = 1
    order by h.k, h.day nulls last;
$$;

create or replace function public.game_performance_creatives(
    p_game_id  uuid,
    p_from     date,
    p_to       date,
    p_members  jsonb
)
returns table (
    creative_id  uuid,
    own          boolean,
    impressions  bigint,
    sessions     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    members as (
        select (m ->> 'placement')::uuid                     as placement_id,
               nullif(m ->> 'place', '')::uuid               as place_id,
               coalesce((m ->> 'unplaced')::boolean, false)  as unplaced
        from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) m
    ),
    hits as (
        select distinct i.id, i.creative_id, coalesce(i.own, false) as own, i.session_id
        from public.impressions i
        cross join bounds b
        join members m
          on m.placement_id = i.placement_id
         and case
               when m.place_id is not null then i.place_id = m.place_id
               when m.unplaced             then i.place_id is null
               else true
             end
        where i.game_id = p_game_id
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    )
    select h.creative_id, h.own, count(*)::bigint, count(distinct h.session_id)::bigint
    from hits h
    group by h.creative_id, h.own
    order by count(*) desc;
$$;

revoke execute on function public.game_performance(uuid, date, date, jsonb, boolean) from public, anon;
revoke execute on function public.game_performance_creatives(uuid, date, date, jsonb) from public, anon;
grant execute on function public.game_performance(uuid, date, date, jsonb, boolean) to authenticated;
grant execute on function public.game_performance_creatives(uuid, date, date, jsonb) to authenticated;

insert into public.schema_versions (version, name)
values ('0022', '0022_game_performance')
on conflict (version) do nothing;
