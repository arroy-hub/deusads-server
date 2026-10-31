-- DeusADS 0057 - two levels of an impression: viewable by the IAB in-game standard, and the size floor each banner needed
--
-- Run once in the Supabase SQL editor. Safe to run again.
-- Needs 0035 (visibility and attention).
--
-- From SDK 0.13 an impression counts when the banner covers enough of the screen FOR ITS SIZE (a ball needs 0.4% of the
-- screen, a billboard 1.5%, smoothly in between), and says besides whether it was viewable by the IAB in-game standard
-- (Intrinsic In-Game Measurement Guidelines 2.0): at least 1.5% of the screen, under 55 degrees off head-on, at least
-- half visible, for one second in a row. The standard is the same for every size.
--
--   impressions       gains viewable (true / false; null = the SDK did not say, that is before 0.13) and
--                     screen_floor (0 to 1: the share of the screen this banner had to cover to count).
--                     Rows from SDK 0.11 and 0.12 that have the averages are filled in once, here, from those
--                     averages (1.5% of the screen and 55 degrees): an ESTIMATE, since an average cannot tell whether
--                     one whole second held. They are the rows whose sdk_version is below 0.13.
--
--   game_attention() and advertiser_attention() gain one column at the end, viewable: the measured impressions that
--                     were viewable by the standard. The other columns are unchanged.
--
--   game_attention() also gains p_source ('adv' = advertisers' views, the default and what it always counted;
--                     'own' = the developer's own creatives; 'all' = both), so the dashboard's Attention cards can follow the
--                     Advertisers / My creatives / All switch of the Performance page. A call without p_source behaves as before.
--
-- Until this is applied the server stores impressions without the two columns and the dashboards show no viewable figure.

alter table public.impressions add column if not exists viewable     boolean;
alter table public.impressions add column if not exists screen_floor numeric(5,4);

update public.impressions
   set viewable = (screen_fraction >= 0.015 and view_angle <= 55)
 where viewable is null
   and screen_fraction is not null
   and view_angle is not null;

drop function if exists public.game_attention(uuid, date, date);
drop function if exists public.game_attention(uuid, date, date, text);

create function public.game_attention(
    p_game_id uuid,
    p_from    date,
    p_to      date,
    p_source  text default 'adv'
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
    m as (
        select i.visible_seconds, i.view_distance, i.screen_fraction, i.view_angle, i.viewable
        from public.impressions i
        cross join bounds b
        where i.game_id = p_game_id
          and (case coalesce(p_source, 'adv') when 'all' then true when 'own' then coalesce(i.own, false) else not coalesce(i.own, false) end)
          and i.view_distance is not null
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    ),
    o as (
        select coalesce(sum(a.opportunities), 0)::bigint as n
        from public.ad_opportunities a
        cross join bounds b
        where a.game_id = p_game_id
          and (case coalesce(p_source, 'adv') when 'all' then true when 'own' then a.own else not a.own end)
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
           count(*) filter (where m.visible_seconds >= 3 and m.view_distance <= 3)::bigint,
           count(*) filter (where m.viewable)::bigint
    from m;
$$;

revoke execute on function public.game_attention(uuid, date, date, text) from public, anon;
grant execute on function public.game_attention(uuid, date, date, text) to authenticated, service_role;

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
    engaged        bigint,
    viewable       bigint
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc' as t
    ),
    m as (
        select i.visible_seconds, i.view_distance, i.screen_fraction, i.view_angle, i.viewable
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
           count(*) filter (where m.visible_seconds >= 3 and m.view_distance <= 3)::bigint,
           count(*) filter (where m.viewable)::bigint
    from m;
$$;

revoke execute on function public.advertiser_attention(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_attention(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0057', '0057_viewable_impressions')
on conflict (version) do nothing;
