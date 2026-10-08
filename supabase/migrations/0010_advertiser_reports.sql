-- DeusADS 0010 — advertiser reports (stage C of the advertiser cabinet)
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0009 (campaigns and bookings).
--
-- Three read-only functions that count the impressions of an advertiser's creatives:
--
--   advertiser_totals(advertiser, days, campaign)           one row of headline figures
--   advertiser_daily(advertiser, days, campaign)            impressions and sessions per UTC day
--   advertiser_placement_stats(advertiser, days, campaign)  the same per placement and creative
--
-- An impression belongs to an advertiser when its creative does. A creative only
-- reaches a placement through an approved booking, so that is the whole story.
-- With a campaign id, only impressions of that campaign's (creative, placement)
-- pairs are counted.
--
-- The dashboard calls these with the service role after checking who is asking
-- and passes the caller's own id, so they are not callable by users directly.
-- Aggregating in the database keeps clear of PostgREST's 1000-row cap.

create or replace function public.advertiser_totals(
    p_advertiser uuid, p_days integer default 30, p_campaign uuid default null
) returns table (impressions bigint, sessions bigint, avg_visible_seconds numeric, placements bigint)
language sql
stable
set search_path = public
as $$
    select
        count(*)::bigint,
        count(distinct i.session_id)::bigint,
        round(avg(i.visible_seconds), 2),
        count(distinct i.placement_id)::bigint
    from public.impressions i
    join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
    where i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
      and (p_campaign is null or exists (
            select 1 from public.bookings b
            where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser
              and b.creative_id = i.creative_id and b.placement_id = i.placement_id));
$$;

create or replace function public.advertiser_daily(
    p_advertiser uuid, p_days integer default 30, p_campaign uuid default null
) returns table (day date, impressions bigint, sessions bigint)
language sql
stable
set search_path = public
as $$
    select
        (i.occurred_at at time zone 'utc')::date,
        count(*)::bigint,
        count(distinct i.session_id)::bigint
    from public.impressions i
    join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
    where i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
      and (p_campaign is null or exists (
            select 1 from public.bookings b
            where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser
              and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    group by 1
    order by 1;
$$;

create or replace function public.advertiser_placement_stats(
    p_advertiser uuid, p_days integer default 30, p_campaign uuid default null
) returns table (placement_id uuid, creative_id uuid, impressions bigint, sessions bigint, avg_visible_seconds numeric)
language sql
stable
set search_path = public
as $$
    select
        i.placement_id,
        i.creative_id,
        count(*)::bigint,
        count(distinct i.session_id)::bigint,
        round(avg(i.visible_seconds), 2)
    from public.impressions i
    join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
    where i.placement_id is not null
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
      and (p_campaign is null or exists (
            select 1 from public.bookings b
            where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser
              and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    group by i.placement_id, i.creative_id
    order by count(*) desc;
$$;

revoke execute on function public.advertiser_totals(uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.advertiser_daily(uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.advertiser_placement_stats(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_totals(uuid, integer, uuid) to service_role;
grant execute on function public.advertiser_daily(uuid, integer, uuid) to service_role;
grant execute on function public.advertiser_placement_stats(uuid, integer, uuid) to service_role;
