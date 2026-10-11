-- DeusADS 0020 — a developer's own creatives, kept apart from advertisers' creatives
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0019 (and everything before it).
--
-- A developer puts pictures of their own on a placement; they show there, in turn, whenever no
-- advertiser is booked. Until now those pictures were picked from the same library as the
-- advertisers' creatives. This separates the two:
--
--   1. creatives.kind: 'campaign' (an advertiser's creative, what it has always been) or 'own'
--      (a picture a developer put on one of their placements). 'own' creatives never appear in
--      the advertiser's Creatives list, in booking, or in the review queue.
--   2. Up to 5 own creatives per placement (a trigger on assignments, source = 'own'). The old rule
--      "one active own assignment per placement" goes; assignments.active now means the developer
--      has this creative switched on.
--   3. Every existing "own" assignment is removed: those pointed at library creatives, which a
--      developer no longer picks. The placements fall back to the SDK's texture until the developer
--      uploads pictures of their own. The creatives themselves stay in their owner's library.
--   4. impressions.own: true for a view of an own creative (set when the SDK reports it), so the
--      dashboard can count own views separately from advertisers' views and, when asked, together.
--   5. game_own_stats / game_own_daily / game_own_placement_stats: the own-view counterparts of
--      game_stats / game_daily_by_placement / game_placement_stats. Security invoker, like those.
--
-- Until this is applied nothing breaks: the placement card says the update is missing, and the
-- Performance numbers count every view as before.

alter table public.creatives
    add column if not exists kind text not null default 'campaign' check (kind in ('campaign', 'own'));

drop index if exists public.assignments_one_active_own_per_placement;
create index if not exists assignments_own_placement_idx
    on public.assignments (placement_id) where source = 'own';

create or replace function private.limit_own_per_placement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.source = 'own' and (
        select count(*) from public.assignments a
        where a.placement_id = new.placement_id and a.source = 'own'
    ) >= 5 then
        raise exception 'A placement holds at most 5 own creatives' using errcode = '23514';
    end if;
    return new;
end;
$$;

create or replace trigger assignments_limit_own
    before insert on public.assignments
    for each row execute function private.limit_own_per_placement();

delete from public.assignments where source = 'own';

alter table public.impressions
    add column if not exists own boolean not null default false;

create or replace function public.game_own_stats(p_game_id uuid)
returns table (impressions bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select count(*)::bigint from public.impressions where game_id = p_game_id and own;
$$;

create or replace function public.game_own_daily(
    p_game_id uuid,
    p_days integer default 30,
    p_placement_ids uuid[] default null
)
returns table (day date, impressions bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select
        (i.occurred_at at time zone 'utc')::date as day,
        count(*)::bigint                         as impressions
    from public.impressions i
    where i.game_id = p_game_id
      and i.own
      and (p_placement_ids is null or i.placement_id = any (p_placement_ids))
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
    group by 1
    order by 1;
$$;

create or replace function public.game_own_placement_stats(p_game_id uuid, p_days integer default 30)
returns table (placement_id uuid, impressions bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select i.placement_id, count(*)::bigint
    from public.impressions i
    where i.game_id = p_game_id
      and i.own
      and i.placement_id is not null
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
    group by i.placement_id;
$$;

revoke execute on function public.game_own_stats(uuid) from public, anon;
revoke execute on function public.game_own_daily(uuid, integer, uuid[]) from public, anon;
revoke execute on function public.game_own_placement_stats(uuid, integer) from public, anon;
grant execute on function public.game_own_stats(uuid) to authenticated;
grant execute on function public.game_own_daily(uuid, integer, uuid[]) to authenticated;
grant execute on function public.game_own_placement_stats(uuid, integer) to authenticated;

insert into public.schema_versions (version, name)
values ('0020', '0020_own_creatives')
on conflict (version) do nothing;
