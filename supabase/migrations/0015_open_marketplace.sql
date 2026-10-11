-- DeusADS 0015 — an open marketplace: accounts chosen at sign-up, ad categories,
-- automatic booking approval, several advertisers rotating on one placement
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0014 (and everything before it).
--
--   1. Sign-up chooses the account type. handle_new_user() reads account_type from the
--      sign-up metadata and accepts only 'developer' or 'advertiser' (default developer),
--      so nobody can sign up as an admin. An advertiser has the role at once, with no
--      application. Developers and advertisers stay separate accounts.
--   2. accounts.suspended_at (an admin can switch an account off) and
--      accounts.allow_restricted (a developer opts in to ads in restricted categories).
--   3. ad_categories: a fixed list. creatives.ad_category is chosen by the advertiser
--      when uploading (until the automatic review exists, nothing checks it but the
--      admin reading the queue). Existing creatives become 'other'.
--   4. developer_blocks: a developer blocks an advertiser, a single creative or a whole
--      category in all their games.
--   5. Rotation. assignments.source is 'own' (the developer's own creative, the fallback)
--      or 'booking' (an advertiser's). A placement may now carry many active booking
--      assignments; only one active 'own' assignment per placement remains. The unique
--      index "one approved booking per placement" goes, and so does the rule behind
--      PLACEMENT_TAKEN for new bookings. The manifest picks one of the active booking
--      assignments per placement (code, not SQL).
--   6. Bookings are approved automatically. activate_booking() checks the placement is
--      open, the creative is approved, the developer has not blocked it and the category
--      is accepted, then creates the assignment. A booking whose creative is still being
--      reviewed stays 'pending'; activate_waiting_bookings() starts it when the creative
--      is approved and close_waiting_bookings() closes it when the creative is rejected.
--   7. sync_booking_schedule() no longer switches other assignments off when a booking
--      starts: it only starts and ends the booking's own assignment.
--
-- decide_booking() (two-sided approval) is left in place so the code that is live while
-- this runs keeps working; the new code no longer calls it, and a later migration drops it.
-- admin_decision stays at 'pending' on new bookings and is no longer used.
--
-- Until the new code is deployed nothing visible changes: no booking exists yet in the
-- live database, and a database that has not run this migration still works with the
-- new code (it falls back to one creative per placement).

-- ------------------------------------------------------------ 1. sign-up type
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    chosen public.account_role;
begin
    chosen := case new.raw_user_meta_data ->> 'account_type'
        when 'advertiser' then 'advertiser'::public.account_role
        else 'developer'::public.account_role
    end;

    insert into public.accounts (id, email, role)
    values (new.id, new.email, chosen)
    on conflict (id) do nothing;
    return new;
end;
$$;

-- ------------------------------------------------------------ 2. account flags
alter table public.accounts add column if not exists suspended_at timestamptz;
alter table public.accounts add column if not exists allow_restricted boolean not null default false;

-- ------------------------------------------------------------ 3. categories
create table if not exists public.ad_categories (
    id         text primary key check (id ~ '^[a-z_]{2,40}$'),
    label      text not null,
    restricted boolean not null default false,
    sort       integer not null default 0
);

insert into public.ad_categories (id, label, restricted, sort) values
    ('games_apps',        'Games and apps',             false, 10),
    ('entertainment',     'Entertainment and media',    false, 20),
    ('food_drink',        'Food and drink',             false, 30),
    ('retail',            'Retail and e-commerce',      false, 40),
    ('tech',              'Tech and hardware',          false, 50),
    ('finance',           'Finance and crypto',         false, 60),
    ('health_fitness',    'Health and fitness',         false, 70),
    ('education',         'Education',                  false, 80),
    ('travel',            'Travel',                     false, 90),
    ('auto',              'Automotive',                 false, 100),
    ('alcohol_tobacco',   'Alcohol and tobacco',        true,  110),
    ('gambling',          'Gambling and betting',       true,  120),
    ('dating_adult',      'Dating and adult',           true,  130),
    ('other',             'Other',                      false, 900)
on conflict (id) do nothing;

alter table public.ad_categories enable row level security;
drop policy if exists ad_categories_read on public.ad_categories;
create policy ad_categories_read on public.ad_categories
    for select to authenticated using (true);
revoke all on public.ad_categories from public, anon, authenticated;
grant select on public.ad_categories to authenticated;

-- The default keeps the code that is live today working: it does not send a category.
alter table public.creatives
    add column if not exists ad_category text not null default 'other' references public.ad_categories (id);

-- The advertiser picks the category at upload and cannot change it afterwards.
grant insert (ad_category) on public.creatives to authenticated;

-- ------------------------------------------------------------ 4. developer blocks
create table if not exists public.developer_blocks (
    id            uuid primary key default gen_random_uuid(),
    developer_id  uuid not null references public.accounts (id) on delete cascade,
    kind          text not null check (kind in ('advertiser', 'creative', 'category')),
    advertiser_id uuid references public.accounts (id) on delete cascade,
    creative_id   uuid references public.creatives (id) on delete cascade,
    category      text references public.ad_categories (id) on delete cascade,
    created_at    timestamptz not null default now(),
    check (
        (kind = 'advertiser' and advertiser_id is not null and creative_id is null and category is null)
        or (kind = 'creative' and creative_id is not null and advertiser_id is null and category is null)
        or (kind = 'category' and category is not null and advertiser_id is null and creative_id is null)
    )
);

create unique index if not exists developer_blocks_advertiser_uq
    on public.developer_blocks (developer_id, advertiser_id) where kind = 'advertiser';
create unique index if not exists developer_blocks_creative_uq
    on public.developer_blocks (developer_id, creative_id) where kind = 'creative';
create unique index if not exists developer_blocks_category_uq
    on public.developer_blocks (developer_id, category) where kind = 'category';
create index if not exists developer_blocks_advertiser_idx on public.developer_blocks (advertiser_id) where advertiser_id is not null;
create index if not exists developer_blocks_creative_idx   on public.developer_blocks (creative_id)   where creative_id is not null;

alter table public.developer_blocks enable row level security;
drop policy if exists developer_blocks_own_read on public.developer_blocks;
create policy developer_blocks_own_read on public.developer_blocks
    for select to authenticated using (developer_id = (select auth.uid()));
revoke all on public.developer_blocks from public, anon, authenticated;
grant select on public.developer_blocks to authenticated;

-- ------------------------------------------------------------ 5. rotation
alter table public.assignments
    add column if not exists source text not null default 'own' check (source in ('own', 'booking'));

update public.assignments a
set source = 'booking'
where a.source = 'own'
  and exists (select 1 from public.bookings b where b.assignment_id = a.id);

-- One active assignment per placement was the old rule. It now holds only for the
-- developer's own creative; any number of bookings may be active next to it.
drop index if exists public.assignments_one_active_per_placement;
create unique index if not exists assignments_one_active_own_per_placement
    on public.assignments (placement_id) where active and source = 'own';

-- A placement may carry many approved bookings now, but one creative once.
drop index if exists public.bookings_one_approved_per_placement;
create unique index if not exists bookings_one_live_creative_per_placement
    on public.bookings (placement_id, creative_id) where status in ('pending', 'approved');

-- ------------------------------------------------------------ 6. automatic approval
-- Returns the booking's status afterwards: 'approved', 'rejected', 'cancelled', or
-- 'pending' while the creative is still being reviewed. Safe to call again: a booking
-- that is no longer pending is returned as it is.
create or replace function public.activate_booking(p_booking uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
    b          public.bookings%rowtype;
    p          public.placements%rowtype;
    today      date := (now() at time zone 'utc')::date;
    cat        text;
    is_restr   boolean;
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
    select c.ad_category, k.restricted
    into cat, is_restr
    from public.creatives c
    join public.ad_categories k on k.id = c.ad_category
    where c.id = b.creative_id and c.status = 'approved';
    if not found then return 'pending'; end if;

    select * into p from public.placements where id = b.placement_id;

    if not found or p.removed_at is not null or not p.open_to_advertisers then
        reason := 'The placement is not open to advertisers';
    elsif exists (
        select 1 from public.developer_blocks d
        where d.developer_id = b.developer_id
          and (
              (d.kind = 'advertiser' and d.advertiser_id = b.advertiser_id)
              or (d.kind = 'creative' and d.creative_id = b.creative_id)
              or (d.kind = 'category' and d.category = cat)
          )
    ) then
        -- Deliberately vague: the advertiser is not told which rule matched.
        reason := 'Not accepted by the developer';
    elsif is_restr and not coalesce(
        (select a.allow_restricted from public.accounts a where a.id = b.developer_id), false
    ) then
        reason := 'This game does not accept ads in that category';
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

-- A creative was approved: start the bookings that were waiting for it.
create or replace function public.activate_waiting_bookings(p_creative uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
    r record;
    started integer := 0;
begin
    for r in
        select id from public.bookings
        where creative_id = p_creative and status = 'pending'
        order by created_at
    loop
        if public.activate_booking(r.id) = 'approved' then started := started + 1; end if;
    end loop;
    return started;
end;
$$;

-- A creative was rejected: the bookings waiting for it can never start.
create or replace function public.close_waiting_bookings(p_creative uuid, p_note text default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
    closed integer;
begin
    update public.bookings set
        status        = 'rejected',
        decision_note = coalesce(left(nullif(btrim(p_note), ''), 500), 'The creative was not approved'),
        decided_at    = now()
    where creative_id = p_creative and status = 'pending';
    get diagnostics closed = row_count;
    return closed;
end;
$$;

-- ------------------------------------------------------------ 7. the schedule
-- As in 0013, except that a booking that starts no longer switches other assignments
-- off: bookings rotate, and the developer's own creative stays as the fallback.
create or replace function public.sync_booking_schedule()
returns integer
language plpgsql
set search_path = public
as $$
declare
    today   date := (now() at time zone 'utc')::date;
    changed integer := 0;
    b       record;
begin
    for b in
        select id, assignment_id from public.bookings
        where status = 'approved' and ends_on is not null and ends_on < today
        for update skip locked
    loop
        if b.assignment_id is not null then
            update public.assignments set active = false where id = b.assignment_id;
        end if;
        update public.bookings set status = 'ended', decided_at = now() where id = b.id;
        changed := changed + 1;
    end loop;

    for b in
        select id, assignment_id from public.bookings
        where status = 'approved' and started_at is null and assignment_id is not null
          and (starts_on is null or starts_on <= today)
        for update skip locked
    loop
        update public.assignments set active = true where id = b.assignment_id;
        update public.bookings set started_at = now() where id = b.id;
        changed := changed + 1;
    end loop;

    return changed;
end;
$$;

-- ------------------------------------------------------------ grants
revoke execute on function public.activate_booking(uuid) from public, anon, authenticated;
revoke execute on function public.activate_waiting_bookings(uuid) from public, anon, authenticated;
revoke execute on function public.close_waiting_bookings(uuid, text) from public, anon, authenticated;
revoke execute on function public.sync_booking_schedule() from public, anon, authenticated;
grant execute on function public.activate_booking(uuid) to service_role;
grant execute on function public.activate_waiting_bookings(uuid) to service_role;
grant execute on function public.close_waiting_bookings(uuid, text) to service_role;
grant execute on function public.sync_booking_schedule() to service_role;

insert into public.schema_versions (version, name)
values ('0015', '0015_open_marketplace')
on conflict (version) do nothing;
