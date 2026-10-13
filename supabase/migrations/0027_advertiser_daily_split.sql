-- DeusADS 0027 — impressions per day split by creative and placement, for the Overview chart
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again. Needs 0010.
--
--   advertiser_daily_split(advertiser, days, campaign)   one row per UTC day, creative and placement
--
-- The Overview chart can break the numbers down by campaign, creative, game or format. The campaign
-- split already exists (advertiser_daily with a campaign); this one carries the creative and the
-- placement, and the dashboard adds them up into games (a placement belongs to one game) and formats
-- (a placement has one shape). Same rules as the other advertiser reports: an impression belongs to
-- an advertiser when its creative does, and with a campaign only that campaign's (creative, placement)
-- pairs count. Called by the dashboard with the service role, after it has checked who is asking.
--
-- Until this is applied nothing breaks: the chart keeps Total and Campaign and says the other
-- breakdowns need this migration.

create or replace function public.advertiser_daily_split(
    p_advertiser uuid, p_days integer default 30, p_campaign uuid default null
) returns table (day date, creative_id uuid, placement_id uuid, impressions bigint)
language sql
stable
set search_path = public
as $$
    select
        (i.occurred_at at time zone 'utc')::date,
        i.creative_id,
        i.placement_id,
        count(*)::bigint
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
    group by 1, 2, 3
    order by 1;
$$;

revoke execute on function public.advertiser_daily_split(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_daily_split(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0027', '0027_advertiser_daily_split')
on conflict (version) do nothing;
