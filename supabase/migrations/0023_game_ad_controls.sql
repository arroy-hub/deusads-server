-- DeusADS 0023 — a developer pauses and blocks ads game by game (Campaigns tab)
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0022 (and everything before it).
--
-- Until now a developer's blocks (developer_blocks, 0015) covered every game they own, and blocking
-- cancelled the bookings. The Campaigns tab of a game works differently: everything applies to that
-- game only, nothing is cancelled, and every control can be taken back.
--
--   1. game_ad_controls: a campaign is paused or blocked in a game; a creative or a whole advertiser is
--      blocked in a game. The advertiser sees the state and the reason. Bookings are never touched:
--      the manifest simply does not serve what is paused or blocked.
--   2. game_category_blocks: ad categories blocked in a game. A category with no row follows its
--      default: the restricted ones (alcohol and tobacco, gambling, dating and adult) are blocked.
--   3. game_ad_control_log: every change, for the "twice an hour" limit and for the history.
--   4. game_ad_seen: which campaigns and creatives the developer has opened, so new ones are marked
--      "New" until then. Everything that exists now is marked as seen.
--   5. game_campaign_stats(): views and visible time per creative per day, advertisers only.
--   6. activate_booking() no longer rejects a booking because of a block or a restricted category:
--      the booking is accepted and the manifest filters it. The advertiser then sees why it is not
--      shown in that game. (0016's version otherwise unchanged.)
--   7. Existing developer_blocks and allow_restricted are copied into every game of that developer,
--      so nothing starts or stops showing because of this migration.
--
-- Until this is applied the Campaigns tab says so and the manifest serves as before.

-- ------------------------------------------------------------ 1. controls
create table if not exists public.game_ad_controls (
    id           uuid primary key default gen_random_uuid(),
    game_id      uuid not null references public.games (id) on delete cascade,
    developer_id uuid not null references public.accounts (id) on delete cascade,
    scope        text not null check (scope in ('campaign', 'creative', 'advertiser')),
    target_id    uuid not null,
    state        text not null check (state in ('paused', 'blocked')),
    reason       text check (char_length(reason) <= 300),
    comment      text check (char_length(comment) <= 500),
    changed_at   timestamptz not null default now(),
    unique (game_id, scope, target_id),
    -- only a campaign can be paused; a creative or an advertiser is blocked or free
    check (scope = 'campaign' or state = 'blocked')
);
create index if not exists game_ad_controls_target_idx on public.game_ad_controls (scope, target_id);
create index if not exists game_ad_controls_developer_idx on public.game_ad_controls (developer_id);

-- ------------------------------------------------------------ 2. categories
create table if not exists public.game_category_blocks (
    game_id    uuid not null references public.games (id) on delete cascade,
    category   text not null references public.ad_categories (id) on delete cascade,
    blocked    boolean not null,
    changed_at timestamptz not null default now(),
    primary key (game_id, category)
);

-- ------------------------------------------------------------ 3. log
create table if not exists public.game_ad_control_log (
    id           bigserial primary key,
    game_id      uuid not null references public.games (id) on delete cascade,
    developer_id uuid not null references public.accounts (id) on delete cascade,
    scope        text not null check (scope in ('campaign', 'creative', 'advertiser', 'category')),
    target_id    text not null,
    action       text not null check (action in ('pause', 'resume', 'block', 'unblock')),
    reason       text,
    bulk_key     text,     -- the same set of targets and action, for a bulk change
    batch_id     uuid,     -- one value per bulk change; null for a change of one item
    created_at   timestamptz not null default now()
);
create index if not exists game_ad_control_log_target_idx
    on public.game_ad_control_log (game_id, scope, target_id, created_at desc);
create index if not exists game_ad_control_log_bulk_idx
    on public.game_ad_control_log (game_id, bulk_key, created_at desc) where bulk_key is not null;

alter table public.game_ad_controls    enable row level security;
alter table public.game_category_blocks enable row level security;
alter table public.game_ad_control_log  enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_ad_controls' and policyname = 'game_ad_controls_owner_read') then
        create policy game_ad_controls_owner_read on public.game_ad_controls
            for select to authenticated using (developer_id = (select auth.uid()));
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_category_blocks' and policyname = 'game_category_blocks_owner_read') then
        create policy game_category_blocks_owner_read on public.game_category_blocks
            for select to authenticated
            using (exists (select 1 from public.games g where g.id = game_id and g.owner_id = (select auth.uid())));
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_ad_control_log' and policyname = 'game_ad_control_log_owner_read') then
        create policy game_ad_control_log_owner_read on public.game_ad_control_log
            for select to authenticated using (developer_id = (select auth.uid()));
    end if;
end $$;

-- Written only by the dashboard (service role), which checks who is calling and the limits.
revoke all on public.game_ad_controls, public.game_category_blocks, public.game_ad_control_log from public, anon, authenticated;
grant select on public.game_ad_controls, public.game_category_blocks, public.game_ad_control_log to authenticated;

-- ------------------------------------------------------------ 3b. what was opened
create table if not exists public.game_ad_seen (
    game_id      uuid not null references public.games (id) on delete cascade,
    developer_id uuid not null references public.accounts (id) on delete cascade,
    kind         text not null check (kind in ('campaign', 'creative')),
    target_id    uuid not null,
    seen_at      timestamptz not null default now(),
    primary key (game_id, kind, target_id)
);
alter table public.game_ad_seen enable row level security;
do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_ad_seen' and policyname = 'game_ad_seen_owner_read') then
        create policy game_ad_seen_owner_read on public.game_ad_seen
            for select to authenticated using (developer_id = (select auth.uid()));
    end if;
end $$;
revoke all on public.game_ad_seen from public, anon, authenticated;
grant select on public.game_ad_seen to authenticated;

-- Everything booked in a game so far counts as seen: only what arrives after this is "New".
insert into public.game_ad_seen (game_id, developer_id, kind, target_id)
select distinct p.game_id, b.developer_id, 'campaign', b.campaign_id
from public.bookings b
join public.placements p on p.id = b.placement_id
on conflict (game_id, kind, target_id) do nothing;

insert into public.game_ad_seen (game_id, developer_id, kind, target_id)
select distinct p.game_id, b.developer_id, 'creative', b.creative_id
from public.bookings b
join public.placements p on p.id = b.placement_id
on conflict (game_id, kind, target_id) do nothing;

-- ------------------------------------------------------------ 4. figures per creative
-- Views of advertisers' creatives in one game, per creative and day, with visible time as a sum and a
-- count (so any mix can be averaged). The developer's own pictures are not included.
create or replace function public.game_campaign_stats(
    p_game_id uuid,
    p_from    date,
    p_to      date
)
returns table (creative_id uuid, day date, views bigint, visible_sum numeric, visible_n bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select i.creative_id,
           (i.occurred_at at time zone 'utc')::date as day,
           count(*)::bigint                          as views,
           coalesce(sum(i.visible_seconds), 0)       as visible_sum,
           count(i.visible_seconds)::bigint          as visible_n
    from public.impressions i
    where i.game_id = p_game_id
      and not coalesce(i.own, false)
      and i.creative_id is not null
      and i.occurred_at >= (greatest(p_from, p_to - 365)::timestamp at time zone 'utc')
      and i.occurred_at <  ((p_to + 1)::timestamp at time zone 'utc')
    group by i.creative_id, (i.occurred_at at time zone 'utc')::date;
$$;

revoke execute on function public.game_campaign_stats(uuid, date, date) from public, anon;
grant execute on function public.game_campaign_stats(uuid, date, date) to authenticated;

-- ------------------------------------------------------------ 5. activate_booking
-- 0016's function without the two rejections that depended on blocks and restricted categories.
create or replace function public.activate_booking(p_booking uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
    b          public.bookings%rowtype;
    p          public.placements%rowtype;
    today      date := (now() at time zone 'utc')::date;
    reason     text;
    start_now  boolean;
    new_assign uuid;
begin
    select * into b from public.bookings where id = p_booking for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if b.status <> 'pending' then return b.status; end if;

    if b.ends_on is not null and b.ends_on < today then
        update public.bookings
        set status = 'cancelled', decision_note = 'The end date has already passed', decided_at = now()
        where id = b.id;
        return 'cancelled';
    end if;

    -- The creative must be approved; until it is, the booking waits.
    if not exists (select 1 from public.creatives c where c.id = b.creative_id and c.status = 'approved') then
        return 'pending';
    end if;

    select * into p from public.placements where id = b.placement_id;

    if not found or p.removed_at is not null or not p.open_to_advertisers then
        reason := 'The placement is not open to advertisers';
    elsif exists (
        select 1 from public.accounts a
        where a.id in (b.advertiser_id, b.developer_id) and a.suspended_at is not null
    ) then
        reason := 'This account is suspended';
    end if;

    if reason is not null then
        update public.bookings
        set status = 'rejected', developer_decision = 'rejected', decision_note = reason, decided_at = now()
        where id = b.id;
        return 'rejected';
    end if;

    start_now := b.starts_on is null or b.starts_on <= today;

    insert into public.assignments (placement_id, creative_id, owner_id, active, source)
    values (b.placement_id, b.creative_id, b.developer_id, start_now, 'booking')
    returning id into new_assign;

    update public.bookings set
        status             = 'approved',
        developer_decision = 'approved',
        assignment_id      = new_assign,
        started_at         = case when start_now then now() else started_at end,
        decided_at         = now()
    where id = b.id;

    return 'approved';
end;
$$;

revoke execute on function public.activate_booking(uuid) from public, anon, authenticated;
grant execute on function public.activate_booking(uuid) to service_role;

-- ------------------------------------------------------------ 6. carry the old blocks over
-- Every game of a developer gets the blocks the developer had, so nothing changes for players.
insert into public.game_ad_controls (game_id, developer_id, scope, target_id, state, reason)
select g.id, d.developer_id, 'advertiser', d.advertiser_id, 'blocked', 'Blocked before blocks were set per game'
from public.developer_blocks d
join public.games g on g.owner_id = d.developer_id
where d.kind = 'advertiser' and d.advertiser_id is not null
on conflict (game_id, scope, target_id) do nothing;

insert into public.game_ad_controls (game_id, developer_id, scope, target_id, state, reason)
select g.id, d.developer_id, 'creative', d.creative_id, 'blocked', 'Blocked before blocks were set per game'
from public.developer_blocks d
join public.games g on g.owner_id = d.developer_id
where d.kind = 'creative' and d.creative_id is not null
on conflict (game_id, scope, target_id) do nothing;

insert into public.game_category_blocks (game_id, category, blocked)
select g.id, d.category, true
from public.developer_blocks d
join public.games g on g.owner_id = d.developer_id
where d.kind = 'category' and d.category is not null
on conflict (game_id, category) do nothing;

-- A developer who accepted restricted categories had them open in every game; explicit blocks above win.
insert into public.game_category_blocks (game_id, category, blocked)
select g.id, k.id, false
from public.accounts a
join public.games g on g.owner_id = a.id
cross join public.ad_categories k
where a.allow_restricted and k.restricted
on conflict (game_id, category) do nothing;

insert into public.schema_versions (version, name)
values ('0023', '0023_game_ad_controls')
on conflict (version) do nothing;
