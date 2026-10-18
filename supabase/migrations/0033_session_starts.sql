-- DeusADS 0033 — session starts: the SDK says when a play session begins, so "impressions per session"
-- can count every session of a game, also the ones in which no ad was shown.
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0032 (game_performance with players).
--
--   game_sessions            one row per session the SDK (0.10+) announced: game, session id, anonymous install ID,
--                            SDK version, start time. The primary key makes a repeated announcement a no-op.
--
--   game_performance()       keeps every column it had and gains
--                              game_sessions  sessions the game started in the window (per day for by-day rows)
--                              adv_started    advertisers' views that belong to an announced session
--                              own_started    the developer's own views that belong to an announced session
--                            Views from sessions nobody announced (older SDKs) are left out of "per session" on
--                            both sides of the ratio, so older data never makes the figure look better than it is.
--
-- The function changes its result shape, so it is dropped and made again with the same grants. Until this is
-- applied the dashboards keep working and show no per-session figure.

create table if not exists public.game_sessions (
    game_id      uuid        not null references public.games (id) on delete cascade,
    session_id   text        not null,
    owner_id     uuid        not null references public.accounts (id) on delete cascade,
    install_id   text,
    sdk_version  text,
    started_at   timestamptz not null,
    received_at  timestamptz not null default now(),
    primary key (game_id, session_id)
);

create index if not exists game_sessions_game_time_idx
    on public.game_sessions (game_id, started_at desc);

create index if not exists game_sessions_owner_idx
    on public.game_sessions (owner_id);

alter table public.game_sessions enable row level security;

drop policy if exists game_sessions_owner_read on public.game_sessions;
create policy game_sessions_owner_read on public.game_sessions
    for select to authenticated
    using (owner_id = (select auth.uid()));

revoke all on public.game_sessions from public, anon, authenticated;
grant select on public.game_sessions to authenticated;
grant select, insert, update, delete on public.game_sessions to service_role;

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
    own_tracked      bigint,
    game_sessions    bigint,
    adv_started      bigint,
    own_started      bigint
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
               (s.session_id is not null)                as started,
               (i.occurred_at at time zone 'utc')::date  as day
        from public.impressions i
        cross join bounds b
        left join public.game_sessions s
               on s.game_id = i.game_id and s.session_id = i.session_id
        where i.game_id = p_game_id
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    ),
    sess as (
        select (gs.started_at at time zone 'utc')::date  as day
        from public.game_sessions gs
        cross join bounds b
        where gs.game_id = p_game_id
          and gs.started_at >= (b.lo::timestamp at time zone 'utc')
          and gs.started_at <  ((b.hi + 1)::timestamp at time zone 'utc')
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
        select sc.k, w.id, w.own, w.session_id, w.install_id, w.visible_seconds, w.started, w.day
        from scopes sc
        join window_rows w on sc.every
        union
        select m.k, w.id, w.own, w.session_id, w.install_id, w.visible_seconds, w.started, w.day
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
           count(h.install_id) filter (where h.own)                   as own_tracked,
           case when grouping(h.day) = 1
                then (select count(*) from sess)
                else (select count(*) from sess x where x.day = h.day)
           end                                                        as game_sessions,
           count(*) filter (where not h.own and h.started)            as adv_started,
           count(*) filter (where h.own and h.started)                as own_started
    from hits h
    group by grouping sets ((h.k), (h.k, h.day))
    having p_by_day or grouping(h.day) = 1
    order by h.k, h.day nulls last;
$$;

revoke execute on function public.game_performance(uuid, date, date, jsonb, boolean) from public, anon;
grant execute on function public.game_performance(uuid, date, date, jsonb, boolean) to authenticated, service_role;

insert into public.schema_versions (version, name)
values ('0033', '0033_session_starts')
on conflict (version) do nothing;
