-- DeusADS 0043 — one campaign, compared by creative and by game
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0036 (interactions) and everything before it.
--
--   advertiser_compare(advertiser, days, campaign)
--       One row per creative and one per game of the campaign, over the same days, with what the comparison
--       table on the campaign's report shows: impressions, average and total time in view, measured views and
--       the chances to be seen (Viewable), views that lasted 3 s or more from within 3 m (Engaged), views on
--       interactive placements and those where the player touched the object (Touched), and the different
--       players. `kind` is 'creative' or 'game'; `id` is that creative's or game's id. Players are counted
--       within each row, so the rows of one kind do not add up to the campaign's total.
--       Service role only, like the other advertiser_* functions: the dashboard checks whose campaign it is.
--
-- Until this is applied the campaign's report still opens; the comparison table shows the figures it had before.

drop function if exists public.advertiser_compare(uuid, integer, uuid);

create function public.advertiser_compare(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null
)
returns table (
    kind             text,
    id               uuid,
    impressions      bigint,
    avg_visible      numeric,
    visible_seconds  numeric,
    measured         bigint,
    opportunities    bigint,
    engaged          bigint,
    interactive      bigint,
    touched          bigint,
    players          bigint,
    player_views     bigint
)
language sql
stable
set search_path = public
as $$
    with since as (
        select (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc' as t
    ),
    v as (
        select i.creative_id, p.game_id, i.install_id, i.visible_seconds, i.view_distance, i.interactions, p.interactive
        from public.impressions i
        join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
        join public.placements p on p.id = i.placement_id
        cross join since s
        where i.occurred_at >= s.t
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id))
    ),
    o as (
        select a.creative_id, p.game_id, a.opportunities
        from public.ad_opportunities a
        join public.creatives c on c.id = a.creative_id and c.owner_id = p_advertiser
        join public.placements p on p.id = a.placement_id
        cross join since s
        where a.occurred_at >= s.t
          and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = a.creative_id and b.placement_id = a.placement_id))
    ),
    by_creative as (
        select 'creative'::text as kind, v.creative_id as id,
               count(*)::bigint as impressions,
               round(avg(v.visible_seconds), 2) as avg_visible,
               coalesce(sum(v.visible_seconds), 0)::numeric as visible_seconds,
               (count(*) filter (where v.view_distance is not null))::bigint as measured,
               (count(*) filter (where v.view_distance is not null and v.visible_seconds >= 3 and v.view_distance <= 3))::bigint as engaged,
               (count(*) filter (where v.view_distance is not null and v.interactive))::bigint as interactive,
               (count(*) filter (where v.view_distance is not null and v.interactive and coalesce(v.interactions, 0) > 0))::bigint as touched,
               count(distinct v.install_id)::bigint as players,
               count(v.install_id)::bigint as player_views
        from v group by v.creative_id
    ),
    by_game as (
        select 'game'::text as kind, v.game_id as id,
               count(*)::bigint as impressions,
               round(avg(v.visible_seconds), 2) as avg_visible,
               coalesce(sum(v.visible_seconds), 0)::numeric as visible_seconds,
               (count(*) filter (where v.view_distance is not null))::bigint as measured,
               (count(*) filter (where v.view_distance is not null and v.visible_seconds >= 3 and v.view_distance <= 3))::bigint as engaged,
               (count(*) filter (where v.view_distance is not null and v.interactive))::bigint as interactive,
               (count(*) filter (where v.view_distance is not null and v.interactive and coalesce(v.interactions, 0) > 0))::bigint as touched,
               count(distinct v.install_id)::bigint as players,
               count(v.install_id)::bigint as player_views
        from v group by v.game_id
    ),
    opp_creative as (select o.creative_id as id, sum(o.opportunities)::bigint as n from o group by o.creative_id),
    opp_game as (select o.game_id as id, sum(o.opportunities)::bigint as n from o group by o.game_id)
    select c.kind, c.id, c.impressions, c.avg_visible, c.visible_seconds, c.measured,
           coalesce(oc.n, 0)::bigint, c.engaged, c.interactive, c.touched, c.players, c.player_views
    from by_creative c left join opp_creative oc on oc.id = c.id
    union all
    select g.kind, g.id, g.impressions, g.avg_visible, g.visible_seconds, g.measured,
           coalesce(og.n, 0)::bigint, g.engaged, g.interactive, g.touched, g.players, g.player_views
    from by_game g left join opp_game og on og.id = g.id;
$$;

revoke execute on function public.advertiser_compare(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_compare(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0043', '0043_campaign_compare')
on conflict (version) do nothing;
