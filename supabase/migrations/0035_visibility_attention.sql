-- DeusADS 0035 — visibility and attention: how long, how close, how head-on, and how many chances an ad had
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0034 (player context) and 0010 (advertiser reports).
--
--   impressions              gains view_distance (metres), screen_fraction (0 to 1) and view_angle (degrees off
--                            head-on), averaged by the SDK (0.11+) over the whole time the banner was in view.
--                            From the same SDK visible_seconds is the whole view, not just the first second that
--                            made it count. Rows from older SDKs have none of the three and are left out of every
--                            attention figure, since their time is the first second only.
--
--   ad_opportunities         one row per batch of times a banner with an ad came into the player's field of view
--                            (SDK 0.11+), whether or not it was looked at long enough to count. The count is
--                            the number of times; event_id makes a retried upload a no-op.
--
--   game_attention()         for the developer: advertisers' views of the game in a period.
--   advertiser_attention()   for the advertiser: his own impressions.
--     Both return one row:
--       measured        impressions with the three figures (SDK 0.11+)
--       opportunities   chances the ad had in the same period
--       avg_distance, avg_fraction, avg_angle
--       median_seconds  middle view time
--       under_2, from_2_to_5, from_5_to_10, over_10   views by length
--       engaged         views of 3 seconds or more from 3 metres or closer
--
-- Until this is applied the dashboards work and simply show no attention panel.

alter table public.impressions add column if not exists view_distance  numeric(7,2);
alter table public.impressions add column if not exists screen_fraction numeric(5,4);
alter table public.impressions add column if not exists view_angle     numeric(5,1);

create table if not exists public.ad_opportunities (
    id             bigint generated always as identity primary key,
    event_id       text        not null,
    game_id        uuid        not null references public.games (id) on delete cascade,
    owner_id       uuid        not null references public.accounts (id) on delete cascade,
    placement_id   uuid,
    place_id       uuid,
    creative_id    uuid,
    session_id     text        not null,
    install_id     text,
    opportunities  integer     not null check (opportunities > 0),
    own            boolean     not null default false,
    occurred_at    timestamptz not null,
    received_at    timestamptz not null default now()
);

create unique index if not exists ad_opportunities_event_unique
    on public.ad_opportunities (game_id, event_id);

create index if not exists ad_opportunities_game_time_idx
    on public.ad_opportunities (game_id, occurred_at desc);

create index if not exists ad_opportunities_creative_idx
    on public.ad_opportunities (creative_id);

alter table public.ad_opportunities enable row level security;

drop policy if exists ad_opportunities_owner_read on public.ad_opportunities;
create policy ad_opportunities_owner_read on public.ad_opportunities
    for select to authenticated
    using (owner_id = (select auth.uid()));

revoke all on public.ad_opportunities from public, anon, authenticated;
grant select on public.ad_opportunities to authenticated;
grant select, insert, update, delete on public.ad_opportunities to service_role;

drop function if exists public.game_attention(uuid, date, date);

create function public.game_attention(
    p_game_id uuid,
    p_from    date,
    p_to      date
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
    engaged        bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    ),
    m as (
        select i.visible_seconds, i.view_distance, i.screen_fraction, i.view_angle
        from public.impressions i
        cross join bounds b
        where i.game_id = p_game_id
          and not coalesce(i.own, false)
          and i.view_distance is not null
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    ),
    o as (
        select coalesce(sum(a.opportunities), 0)::bigint as n
        from public.ad_opportunities a
        cross join bounds b
        where a.game_id = p_game_id
          and not a.own
          and a.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and a.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
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
           count(*) filter (where m.visible_seconds >= 3 and m.view_distance <= 3)::bigint
    from m;
$$;

revoke execute on function public.game_attention(uuid, date, date) from public, anon;
grant execute on function public.game_attention(uuid, date, date) to authenticated, service_role;

drop function if exists public.advertiser_attention(uuid, integer, uuid);

create function public.advertiser_attention(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null
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
    engaged        bigint
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc' as t
    ),
    m as (
        select i.visible_seconds, i.view_distance, i.screen_fraction, i.view_angle
        from public.impressions i
        join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
        cross join since s
        where i.view_distance is not null
          and i.occurred_at >= s.t
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    ),
    o as (
        select coalesce(sum(a.opportunities), 0)::bigint as n
        from public.ad_opportunities a
        join public.creatives c on c.id = a.creative_id and c.owner_id = p_advertiser
        cross join since s
        where a.occurred_at >= s.t
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = a.creative_id and b.placement_id = a.placement_id))
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
           count(*) filter (where m.visible_seconds >= 3 and m.view_distance <= 3)::bigint
    from m;
$$;

revoke execute on function public.advertiser_attention(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_attention(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0035', '0035_visibility_attention')
on conflict (version) do nothing;
