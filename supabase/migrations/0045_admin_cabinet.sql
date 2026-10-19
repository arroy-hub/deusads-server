-- DeusADS 0045 — the admin cabinet: widget boards, impressions per booking, disputes in both directions, admin pause
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0042 (dashboard_layouts), 0024 (creative_disputes), 0013/0015 (bookings) and everything before them.
--
--   1. dashboard_layouts accepts the admin boards ("admin_users", "admin_review", "admin_bookings", "admin_disputes",
--      "admin_traffic").
--   2. admin_booking_impressions() counts impressions per placement and creative, for the All bookings table.
--   3. creative_disputes can also be opened by an advertiser about a game; an admin can pause the booking.
--      dispute_events keeps the replies of both sides and the admin's decision.
--   4. bookings.admin_paused_at: an admin can pause a booking from a dispute. It stops serving (the assignment goes
--      inactive) and the daily schedule does not start it again until an admin resumes it.
--
-- Until this is applied the cabinet still works: boards keep their layout in the browser, impressions show a dash,
-- disputes stay developer-to-creative and the admin cannot pause a booking.

-- ------------------------------------------------------------ 1. boards
alter table public.dashboard_layouts drop constraint if exists dashboard_layouts_kind_check;
alter table public.dashboard_layouts
    add constraint dashboard_layouts_kind_check check (kind ~ '^(developer|advertiser|admin_[a-z]{3,12})$');

-- ------------------------------------------------------------ 2. impressions per booking
create or replace function public.admin_booking_impressions()
returns table (placement_id uuid, creative_id uuid, n bigint)
language sql
stable
set search_path = public
as $$
    select i.placement_id, i.creative_id, count(*)::bigint
    from public.impressions i
    where i.placement_id is not null and i.creative_id is not null
    group by i.placement_id, i.creative_id;
$$;
revoke execute on function public.admin_booking_impressions() from public, anon, authenticated;
grant execute on function public.admin_booking_impressions() to service_role;

-- ------------------------------------------------------------ 3. disputes both ways
-- developer_id stays the developer of the game the dispute is about; `initiator` says who opened it.
alter table public.creative_disputes
    add column if not exists initiator   text not null default 'developer' check (initiator in ('developer', 'advertiser')),
    add column if not exists advertiser_id uuid references public.accounts (id) on delete set null,
    add column if not exists booking_id  uuid references public.bookings (id) on delete set null,
    add column if not exists admin_note  text check (admin_note is null or char_length(admin_note) <= 1000);

alter table public.creative_disputes drop constraint if exists creative_disputes_outcome_check;
alter table public.creative_disputes
    add constraint creative_disputes_outcome_check check (outcome in ('removed', 'paused', 'dismissed'));

drop index if exists public.creative_disputes_one_open;
create unique index if not exists creative_disputes_one_open_v2
    on public.creative_disputes (game_id, creative_id, initiator) where status = 'open';

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creative_disputes' and policyname = 'creative_disputes_advertiser_read') then
        create policy creative_disputes_advertiser_read on public.creative_disputes
            for select to authenticated using (advertiser_id = (select auth.uid()));
    end if;
end $$;

create table if not exists public.dispute_events (
    id         uuid primary key default gen_random_uuid(),
    dispute_id uuid not null references public.creative_disputes (id) on delete cascade,
    author_id  uuid references public.accounts (id) on delete set null,
    side       text not null check (side in ('developer', 'advertiser', 'admin', 'system')),
    kind       text not null check (kind in ('opened', 'reply', 'decision')),
    text       text not null check (char_length(text) between 1 and 1000),
    created_at timestamptz not null default now()
);
create index if not exists dispute_events_dispute_idx on public.dispute_events (dispute_id, created_at);
alter table public.dispute_events enable row level security;
revoke all on public.dispute_events from public, anon, authenticated;

-- ------------------------------------------------------------ 4. admin pause
alter table public.bookings
    add column if not exists admin_paused_at   timestamptz,
    add column if not exists admin_pause_note  text check (admin_pause_note is null or char_length(admin_pause_note) <= 500);

create or replace function public.admin_pause_booking(p_booking uuid, p_note text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
    b public.bookings%rowtype;
begin
    select * into b from public.bookings where id = p_booking for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if b.status <> 'approved' then raise exception 'NOT_RUNNING'; end if;
    update public.bookings set admin_paused_at = coalesce(admin_paused_at, now()), admin_pause_note = left(p_note, 500) where id = p_booking;
    if b.assignment_id is not null then
        update public.assignments set active = false where id = b.assignment_id;
    end if;
    return 'paused';
end;
$$;

create or replace function public.admin_resume_booking(p_booking uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
    b     public.bookings%rowtype;
    today date := (now() at time zone 'utc')::date;
begin
    select * into b from public.bookings where id = p_booking for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    update public.bookings set admin_paused_at = null, admin_pause_note = null where id = p_booking;
    -- serve again only when the booking is meant to be on right now (the schedule starts the rest later)
    if b.status = 'approved' and b.assignment_id is not null and b.started_at is not null and (b.ends_on is null or b.ends_on >= today) then
        update public.assignments set active = true where id = b.assignment_id;
    end if;
    return 'resumed';
end;
$$;

-- As in 0015, except that a booking an admin paused is not started by the schedule.
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
          and admin_paused_at is null
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

revoke execute on function public.admin_pause_booking(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_resume_booking(uuid) from public, anon, authenticated;
revoke execute on function public.sync_booking_schedule() from public, anon, authenticated;
grant execute on function public.admin_pause_booking(uuid, text) to service_role;
grant execute on function public.admin_resume_booking(uuid) to service_role;
grant execute on function public.sync_booking_schedule() to service_role;

insert into public.schema_versions (version, name)
values ('0045', '0045_admin_cabinet')
on conflict (version) do nothing;
