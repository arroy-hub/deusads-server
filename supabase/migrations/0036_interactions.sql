-- DeusADS 0036 — interactions: the player took hold of, pressed or clicked the object an ad is on
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0035 (visibility and attention).
--
--   placements.interactive   the developer marks a placement Interactive in Unity when the player can touch the
--                            object it is on (a bottle label, a poster they can grab). Large banners stay off.
--                            The SDK (0.11+) sends the flag with the placement list.
--
--   impressions.interactions how many times the player interacted during that view (SDK 0.11+). A view with at
--                            least one counts as an interacted view. Views from older SDKs have none and are left
--                            out of every figure below, like the attention figures.
--
--   game_interactions()      for the developer: one row per interactive placement of the game: measured views of
--                            advertisers' ads, views with an interaction, interactions.
--   advertiser_interactions() for the advertiser: the same, summed over the interactive placements his ads ran on.
--
-- The interaction rate is views with an interaction divided by views on interactive placements, so it can never
-- pass 100% and large banners cannot drag it down. Until this is applied the dashboards work and simply show
-- no interactions panel.

alter table public.placements add column if not exists interactive boolean not null default false;
alter table public.impressions add column if not exists interactions integer;

drop function if exists public.game_interactions(uuid, date, date);

create function public.game_interactions(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (
    placement_id uuid,
    external_id  text,
    label        text,
    views        bigint,
    interacted   bigint,
    interactions bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    )
    select p.id,
           p.external_id,
           p.label,
           count(i.id)::bigint,
           (count(i.id) filter (where coalesce(i.interactions, 0) > 0))::bigint,
           coalesce(sum(i.interactions), 0)::bigint
    from public.placements p
    cross join bounds b
    left join public.impressions i
           on i.placement_id = p.id
          and i.game_id = p_game_id
          and not coalesce(i.own, false)
          and i.view_distance is not null
          and i.occurred_at >= (b.lo::timestamp at time zone 'utc')
          and i.occurred_at <  ((b.hi + 1)::timestamp at time zone 'utc')
    where p.game_id = p_game_id
      and p.interactive
      and p.removed_at is null
    group by p.id, p.external_id, p.label
    order by count(i.id) desc, p.label nulls last, p.external_id;
$$;

revoke execute on function public.game_interactions(uuid, date, date) from public, anon;
grant execute on function public.game_interactions(uuid, date, date) to authenticated, service_role;

drop function if exists public.advertiser_interactions(uuid, integer, uuid);

create function public.advertiser_interactions(
    p_advertiser uuid,
    p_days       integer default 30,
    p_campaign   uuid default null
)
returns table (
    placements   bigint,
    views        bigint,
    interacted   bigint,
    interactions bigint
)
language sql
stable
set search_path = public
as $$
    select count(distinct i.placement_id)::bigint,
           count(*)::bigint,
           (count(*) filter (where coalesce(i.interactions, 0) > 0))::bigint,
           coalesce(sum(i.interactions), 0)::bigint
    from public.impressions i
    join public.creatives c on c.id = i.creative_id and c.owner_id = p_advertiser
    join public.placements p on p.id = i.placement_id and p.interactive
    where i.view_distance is not null
      and i.occurred_at >= (date_trunc('day', now() at time zone 'utc') - make_interval(days => least(greatest(p_days, 1), 365) - 1)) at time zone 'utc'
      and (p_campaign is null or exists (select 1 from public.bookings b where b.campaign_id = p_campaign and b.advertiser_id = p_advertiser and b.creative_id = i.creative_id and b.placement_id = i.placement_id));
$$;

revoke execute on function public.advertiser_interactions(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.advertiser_interactions(uuid, integer, uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0036', '0036_interactions')
on conflict (version) do nothing;
