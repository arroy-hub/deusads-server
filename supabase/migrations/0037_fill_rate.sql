-- DeusADS 0037 — fill rate: for every manifest request, which placements got an ad and why the others stayed empty
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0036.
--
--   manifest_fill           one row per game, day and placement, with counters. Every manifest request (the game
--                           asking at start which ad each placement shows) adds 1 to offered and 1 to exactly one
--                           of the other counters:
--                             filled_ad    an advertiser's ad was served
--                             filled_own   the developer's own creative was served
--                             no_ad        nothing is assigned to the placement
--                             targeting    the creative asks for another kind of game
--                             no_picture   no picture in the shape of the placement
--                             suspended    the advertiser's account is suspended
--                             blocked      the developer paused or blocked it in this game
--                             campaign     the campaign's own rules (paused, audience, skips this game)
--                           Placements the developer switched off are not counted: nobody expects an ad there.
--
--   record_manifest_fill()  adds one manifest request; called by the server only.
--   game_fill_rate()        for the developer: the counters per placement over a period.

create table if not exists public.manifest_fill (
    game_id     uuid    not null references public.games (id) on delete cascade,
    owner_id    uuid    not null references public.accounts (id) on delete cascade,
    day         date    not null,
    external_id text    not null,
    offered     integer not null default 0,
    filled_ad   integer not null default 0,
    filled_own  integer not null default 0,
    no_ad       integer not null default 0,
    targeting   integer not null default 0,
    no_picture  integer not null default 0,
    suspended   integer not null default 0,
    blocked     integer not null default 0,
    campaign    integer not null default 0,
    primary key (game_id, day, external_id)
);

create index if not exists manifest_fill_owner_idx
    on public.manifest_fill (owner_id);

alter table public.manifest_fill enable row level security;

drop policy if exists manifest_fill_owner_read on public.manifest_fill;
create policy manifest_fill_owner_read on public.manifest_fill
    for select to authenticated
    using (owner_id = (select auth.uid()));

revoke all on public.manifest_fill from public, anon, authenticated;
grant select on public.manifest_fill to authenticated;
grant select, insert, update, delete on public.manifest_fill to service_role;

drop function if exists public.record_manifest_fill(uuid, uuid, jsonb);

create function public.record_manifest_fill(
    p_game_id uuid,
    p_owner   uuid,
    p_slots   jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$
    insert into public.manifest_fill as f
        (game_id, owner_id, day, external_id, offered,
         filled_ad, filled_own, no_ad, targeting, no_picture, suspended, blocked, campaign)
    select p_game_id,
           p_owner,
           (now() at time zone 'utc')::date,
           s.key,
           1,
           (s.value = 'ad')::int,
           (s.value = 'own')::int,
           (s.value = 'no_ad')::int,
           (s.value = 'targeting')::int,
           (s.value = 'no_picture')::int,
           (s.value = 'suspended')::int,
           (s.value = 'blocked')::int,
           (s.value = 'campaign')::int
    from jsonb_each_text(case when jsonb_typeof(p_slots) = 'object' then p_slots else '{}'::jsonb end) s
    where s.value in ('ad', 'own', 'no_ad', 'targeting', 'no_picture', 'suspended', 'blocked', 'campaign')
      and length(s.key) between 1 and 200
    on conflict (game_id, day, external_id) do update
        set offered    = f.offered    + 1,
            filled_ad  = f.filled_ad  + excluded.filled_ad,
            filled_own = f.filled_own + excluded.filled_own,
            no_ad      = f.no_ad      + excluded.no_ad,
            targeting  = f.targeting  + excluded.targeting,
            no_picture = f.no_picture + excluded.no_picture,
            suspended  = f.suspended  + excluded.suspended,
            blocked    = f.blocked    + excluded.blocked,
            campaign   = f.campaign   + excluded.campaign;
$$;

revoke execute on function public.record_manifest_fill(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_manifest_fill(uuid, uuid, jsonb) to service_role;

drop function if exists public.game_fill_rate(uuid, date, date);

create function public.game_fill_rate(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (
    external_id text,
    label       text,
    offered     bigint,
    filled_ad   bigint,
    filled_own  bigint,
    no_ad       bigint,
    targeting   bigint,
    no_picture  bigint,
    suspended   bigint,
    blocked     bigint,
    campaign    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
    with bounds as (
        select greatest(p_from, p_to - 365) as lo, p_to as hi
    )
    select f.external_id,
           p.label,
           sum(f.offered)::bigint,
           sum(f.filled_ad)::bigint,
           sum(f.filled_own)::bigint,
           sum(f.no_ad)::bigint,
           sum(f.targeting)::bigint,
           sum(f.no_picture)::bigint,
           sum(f.suspended)::bigint,
           sum(f.blocked)::bigint,
           sum(f.campaign)::bigint
    from public.manifest_fill f
    cross join bounds b
    cross join lateral (
        select pl.label
        from public.placements pl
        where pl.game_id = f.game_id
          and pl.external_id = f.external_id
          and pl.removed_at is null
        limit 1
    ) p
    where f.game_id = p_game_id
      and f.day >= b.lo
      and f.day <= b.hi
    group by f.external_id, p.label
    order by sum(f.offered) desc, f.external_id;
$$;

revoke execute on function public.game_fill_rate(uuid, date, date) from public, anon;
grant execute on function public.game_fill_rate(uuid, date, date) to authenticated, service_role;

insert into public.schema_versions (version, name)
values ('0037', '0037_fill_rate')
on conflict (version) do nothing;
