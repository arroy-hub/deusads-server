-- DeusADS 0038 — SDK performance: frame rate, stutters, creative load time and the SDK's own errors
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0037 and 0034 (the player's platform and device are read from game_sessions).
--
--   session_performance      one row per game and session, with sums that grow as the SDK (0.11+) reports. The
--                            numbers describe the game and the SDK, never the player, and only the developer of the
--                            game can read them. Each report from the SDK is added to the row of its session:
--                              frames, seconds           frames drawn and their total time (FPS = frames / seconds)
--                              slow_frames, hitches      frames longer than 33 ms, and longer than 100 ms
--                              worst_ms                  the longest frame
--                              ad_frames, ad_seconds, ad_slow_frames
--                                                        the same while an ad was being looked at
--                              loads, load_ms, load_ms_max
--                                                        creatives downloaded, and how long that took
--                              cached_loads, cached_ms   creatives read from the disk copy
--                              manifest_loads, manifest_ms
--                                                        the manifest request that worked
--                              manifest_failed, manifest_cached, creative_failed, creative_invalid, upload_failed
--                                                        how often something went wrong
--
--   add_session_performance() adds one report; called by the server only.
--   game_sdk_performance()    for the developer: the sums over a period, overall (dimension all) or per platform
--                             or device.

create table if not exists public.session_performance (
    game_id          uuid    not null references public.games (id) on delete cascade,
    session_id       text    not null,
    owner_id         uuid    not null references public.accounts (id) on delete cascade,
    day              date    not null,
    updated_at       timestamptz not null default now(),
    frames           bigint  not null default 0,
    seconds          numeric not null default 0,
    slow_frames      bigint  not null default 0,
    hitches          bigint  not null default 0,
    worst_ms         numeric not null default 0,
    ad_frames        bigint  not null default 0,
    ad_seconds       numeric not null default 0,
    ad_slow_frames   bigint  not null default 0,
    loads            integer not null default 0,
    load_ms          numeric not null default 0,
    load_ms_max      numeric not null default 0,
    cached_loads     integer not null default 0,
    cached_ms        numeric not null default 0,
    manifest_loads   integer not null default 0,
    manifest_ms      numeric not null default 0,
    manifest_failed  integer not null default 0,
    manifest_cached  integer not null default 0,
    creative_failed  integer not null default 0,
    creative_invalid integer not null default 0,
    upload_failed    integer not null default 0,
    primary key (game_id, session_id)
);

create index if not exists session_performance_day_idx
    on public.session_performance (game_id, day);

create index if not exists session_performance_owner_idx
    on public.session_performance (owner_id);

alter table public.session_performance enable row level security;

drop policy if exists session_performance_owner_read on public.session_performance;
create policy session_performance_owner_read on public.session_performance
    for select to authenticated
    using (owner_id = (select auth.uid()));

revoke all on public.session_performance from public, anon, authenticated;
grant select on public.session_performance to authenticated;
grant select, insert, update, delete on public.session_performance to service_role;

drop function if exists public.add_session_performance(uuid, uuid, text, jsonb);

create function public.add_session_performance(
    p_game_id uuid,
    p_owner   uuid,
    p_session text,
    p_perf    jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$
    insert into public.session_performance as sp
        (game_id, owner_id, session_id, day,
         frames, seconds, slow_frames, hitches, worst_ms,
         ad_frames, ad_seconds, ad_slow_frames,
         loads, load_ms, load_ms_max, cached_loads, cached_ms,
         manifest_loads, manifest_ms,
         manifest_failed, manifest_cached, creative_failed, creative_invalid, upload_failed)
    select p_game_id,
           p_owner,
           p_session,
           (now() at time zone 'utc')::date,
           coalesce((p_perf ->> 'frames')::numeric, 0),
           coalesce((p_perf ->> 'seconds')::numeric, 0),
           coalesce((p_perf ->> 'slow_frames')::numeric, 0),
           coalesce((p_perf ->> 'hitches')::numeric, 0),
           coalesce((p_perf ->> 'worst_ms')::numeric, 0),
           coalesce((p_perf ->> 'ad_frames')::numeric, 0),
           coalesce((p_perf ->> 'ad_seconds')::numeric, 0),
           coalesce((p_perf ->> 'ad_slow_frames')::numeric, 0),
           coalesce((p_perf ->> 'loads')::numeric, 0),
           coalesce((p_perf ->> 'load_ms')::numeric, 0),
           coalesce((p_perf ->> 'load_ms_max')::numeric, 0),
           coalesce((p_perf ->> 'cached_loads')::numeric, 0),
           coalesce((p_perf ->> 'cached_ms')::numeric, 0),
           coalesce((p_perf ->> 'manifest_loads')::numeric, 0),
           coalesce((p_perf ->> 'manifest_ms')::numeric, 0),
           coalesce((p_perf ->> 'manifest_failed')::numeric, 0),
           coalesce((p_perf ->> 'manifest_cached')::numeric, 0),
           coalesce((p_perf ->> 'creative_failed')::numeric, 0),
           coalesce((p_perf ->> 'creative_invalid')::numeric, 0),
           coalesce((p_perf ->> 'upload_failed')::numeric, 0)
    where jsonb_typeof(p_perf) = 'object'
      and length(p_session) between 1 and 200
    on conflict (game_id, session_id) do update
        set updated_at       = now(),
            frames           = sp.frames           + excluded.frames,
            seconds          = sp.seconds          + excluded.seconds,
            slow_frames      = sp.slow_frames      + excluded.slow_frames,
            hitches          = sp.hitches          + excluded.hitches,
            worst_ms         = greatest(sp.worst_ms, excluded.worst_ms),
            ad_frames        = sp.ad_frames        + excluded.ad_frames,
            ad_seconds       = sp.ad_seconds       + excluded.ad_seconds,
            ad_slow_frames   = sp.ad_slow_frames   + excluded.ad_slow_frames,
            loads            = sp.loads            + excluded.loads,
            load_ms          = sp.load_ms          + excluded.load_ms,
            load_ms_max      = greatest(sp.load_ms_max, excluded.load_ms_max),
            cached_loads     = sp.cached_loads     + excluded.cached_loads,
            cached_ms        = sp.cached_ms        + excluded.cached_ms,
            manifest_loads   = sp.manifest_loads   + excluded.manifest_loads,
            manifest_ms      = sp.manifest_ms      + excluded.manifest_ms,
            manifest_failed  = sp.manifest_failed  + excluded.manifest_failed,
            manifest_cached  = sp.manifest_cached  + excluded.manifest_cached,
            creative_failed  = sp.creative_failed  + excluded.creative_failed,
            creative_invalid = sp.creative_invalid + excluded.creative_invalid,
            upload_failed    = sp.upload_failed    + excluded.upload_failed;
$$;

revoke execute on function public.add_session_performance(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_session_performance(uuid, uuid, text, jsonb) to service_role;

drop function if exists public.game_sdk_performance(uuid, date, date, text);

create function public.game_sdk_performance(
    p_game_id   uuid,
    p_from      date,
    p_to        date,
    p_dimension text default 'all'
)
returns table (
    value            text,
    sessions         bigint,
    frames           bigint,
    seconds          numeric,
    slow_frames      bigint,
    hitches          bigint,
    worst_ms         numeric,
    ad_frames        bigint,
    ad_seconds       numeric,
    ad_slow_frames   bigint,
    loads            bigint,
    load_ms          numeric,
    load_ms_max      numeric,
    cached_loads     bigint,
    cached_ms        numeric,
    manifest_loads   bigint,
    manifest_ms      numeric,
    manifest_failed  bigint,
    manifest_cached  bigint,
    creative_failed  bigint,
    creative_invalid bigint,
    upload_failed    bigint
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
        select sp.*,
               case p_dimension
                   when 'all'      then 'all'
                   when 'platform' then gs.platform
                   when 'device'   then gs.device_model
               end as v
        from public.session_performance sp
        cross join bounds b
        left join public.game_sessions gs
               on gs.game_id = sp.game_id and gs.session_id = sp.session_id
        where sp.game_id = p_game_id
          and p_dimension in ('all', 'platform', 'device')
          and sp.day >= b.lo
          and sp.day <= b.hi
    )
    select s.v,
           count(*)::bigint,
           sum(s.frames)::bigint,
           sum(s.seconds),
           sum(s.slow_frames)::bigint,
           sum(s.hitches)::bigint,
           max(s.worst_ms),
           sum(s.ad_frames)::bigint,
           sum(s.ad_seconds),
           sum(s.ad_slow_frames)::bigint,
           sum(s.loads)::bigint,
           sum(s.load_ms),
           max(s.load_ms_max),
           sum(s.cached_loads)::bigint,
           sum(s.cached_ms),
           sum(s.manifest_loads)::bigint,
           sum(s.manifest_ms),
           sum(s.manifest_failed)::bigint,
           sum(s.manifest_cached)::bigint,
           sum(s.creative_failed)::bigint,
           sum(s.creative_invalid)::bigint,
           sum(s.upload_failed)::bigint
    from s
    group by s.v
    order by sum(s.seconds) desc, s.v nulls last
    limit 200;
$$;

revoke execute on function public.game_sdk_performance(uuid, date, date, text) from public, anon;
grant execute on function public.game_sdk_performance(uuid, date, date, text) to authenticated, service_role;

insert into public.schema_versions (version, name)
values ('0038', '0038_sdk_performance')
on conflict (version) do nothing;
