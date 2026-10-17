-- DeusADS 0032 — unique players: the SDK sends an anonymous install ID, the dashboards count it
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0022 (game_performance) and 0010 (advertiser_totals).
--
--   impressions.install_id   random ID the SDK (0.8+) makes once per installation and sends with every batch.
--                            Not a device or account ID. Older SDKs send none: their rows keep it empty.
--
--   game_performance()       gains players / adv_players / own_players (distinct install IDs per source)
--                            and adv_tracked / own_tracked (views that carry an install ID, so
--                            "views per player" is never diluted by older rows that cannot be attributed).
--   advertiser_totals()      gains players and player_views (the same two figures for an advertiser).
--
-- Both functions change their result shape, so they are dropped and made again with the same grants.
-- Until this is applied the dashboards keep working and simply show no player figures.

alter table public.impressions add column if not exists install_id text;

create index if not exists impressions_game_install_idx
    on public.impressions (game_id, install_id)
    where install_id is not null;

drop function if exists public.game_performance(uuid, date, date, jsonb, boolean);

create function public.game_performance(
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
    own_visible_n    bigint,
    players          bigint,
    adv_players      bigint,
    own_players      bigint,
    adv_tracked      bigint,
    own_tracked      bigint
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
               i.install_id,
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
        select sc.k, w.id, w.own, w.session_id, w.install_id, w.visible_seconds, w.day
        from scopes sc
        join window_rows w on sc.every
        union
        select m.k, w.id, w.own, w.session_id, w.install_id, w.visible_seconds, w.day
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
           count(h.visible_seconds) filter (where h.own)              as own_visible_n,
           count(distinct h.install_id)                               as players,
           count(distinct h.install_id) filter (where not h.own)      as adv_players,
           count(distinct h.install_id) filter (where h.own)          as own_players,
           count(h.install_id) filter (where not h.own)               as adv_tracked,
           count(h.install_id) filter (where h.own)                   as own_tracked
    from hits h
    group by grouping sets ((h.k), (h.k, h.day))
    having p_by_day or grouping(h.day) = 1
    order by h.k, h.day nulls last;
$$;

revoke execute on function public.game_performance(uuid, date, date, jsonb, boolean) from public, anon;
grant execute on function public.game_performance(uuid, date, date, jsonb, boolean) to authenticated, service_role;

drop function if exists public.advertiser_totals(uuid, integer, uuid);

create function public.advertiser_totals(
    p_advertiser uuid, p_days integer default 30, p_campaign uuid default null
) returns table (
    impressions bigint, sessions bigint, avg_visible_seconds numeric, placements bigint,
    players bigint, player_views bigint
)
language sql
stable
set search_path = public
as $$
    select count(*)::bigint,
           count(distinct i.session_id)::bigint,
           round(avg(i.visible_seconds), 2),
           count(distinct i.placement_id)::bigint,
           count(distinct i.install_id)::bigint,
           count(i.install_id)::bigint
    from public.impressions i
    join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
    where i.occurred_at >= (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc'
      and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id));
$$;

revoke execute on function public.advertiser_totals(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_totals(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0032', '0032_unique_players')
on conflict (version) do nothing;
