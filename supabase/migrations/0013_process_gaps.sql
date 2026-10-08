-- DeusADS 0013 — closing the gaps in the advertiser process
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0012 (schema_versions) and 0009 (bookings).
--
--   1. role_requests   a developer asks to become an advertiser; an admin decides
--   2. notifications   what the dashboard tells people (and emails, when configured)
--   3. bookings get start and end dates, a 'started_at' stamp and an 'ended' status;
--      decide_booking schedules a booking that starts later instead of activating it
--   4. sync_booking_schedule() starts bookings whose day has come and ends those whose
--      end date has passed; GET /v1/manifest calls it (at most once a minute per server)
--   5. decide_role_request() approves or rejects an application in one transaction
--
-- Dates are UTC calendar days; ends_on is the last day the booking shows.
-- Users can read their own requests and notifications, nothing else; the dashboard
-- writes with the service role after checking who is calling.

-- ------------------------------------------------------------ role requests
create table if not exists public.role_requests (
    id          uuid primary key default gen_random_uuid(),
    account_id  uuid not null references public.accounts(id) on delete cascade,
    company     text not null check (char_length(company) between 2 and 120),
    message     text check (message is null or char_length(message) <= 500),
    status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    review_note text,
    created_at  timestamptz not null default now(),
    reviewed_at timestamptz
);
create index if not exists role_requests_account_idx on public.role_requests (account_id, created_at desc);
create unique index if not exists role_requests_one_pending on public.role_requests (account_id) where status = 'pending';
create index if not exists role_requests_pending_idx on public.role_requests (created_at) where status = 'pending';

-- ------------------------------------------------------------ notifications
create table if not exists public.notifications (
    id         uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts(id) on delete cascade,
    text       text not null check (char_length(text) between 1 and 300),
    link       text,
    created_at timestamptz not null default now(),
    read_at    timestamptz
);
create index if not exists notifications_account_idx on public.notifications (account_id, created_at desc);

alter table public.role_requests enable row level security;
alter table public.notifications enable row level security;

drop policy if exists role_requests_own_read on public.role_requests;
create policy role_requests_own_read on public.role_requests
    for select to authenticated using (account_id = (select auth.uid()));

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications
    for select to authenticated using (account_id = (select auth.uid()));

revoke all on public.role_requests, public.notifications from public, anon, authenticated;
grant select on public.role_requests, public.notifications to authenticated;

-- ------------------------------------------------------------ booking dates
alter table public.bookings add column if not exists starts_on  date;
alter table public.bookings add column if not exists ends_on    date;
alter table public.bookings add column if not exists started_at timestamptz;

alter table public.bookings drop constraint if exists bookings_dates_check;
alter table public.bookings add constraint bookings_dates_check
    check (starts_on is null or ends_on is null or ends_on >= starts_on);

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'ended'));

-- Bookings that were already live started when they were approved.
update public.bookings
set started_at = coalesce(decided_at, now())
where status = 'approved' and started_at is null and assignment_id is not null;

create index if not exists bookings_schedule_idx on public.bookings (starts_on, ends_on) where status = 'approved';

-- ------------------------------------------------------------------ decide
-- As in 0009, plus dates: a booking whose start day has not come yet gets its
-- assignment created inactive, and sync_booking_schedule() switches it on later.
-- New error: BOOKING_EXPIRED (approved after its end date).
create or replace function public.decide_booking(
    p_booking  uuid,
    p_side     text,
    p_decision text,
    p_note     text default null
) returns text
language plpgsql
set search_path = public
as $$
declare
    b          public.bookings%rowtype;
    today      date := (now() at time zone 'utc')::date;
    new_admin  text;
    new_dev    text;
    new_status text;
    new_assign uuid;
    start_now  boolean;
begin
    if p_side not in ('admin', 'developer') or p_decision not in ('approved', 'rejected') then
        raise exception 'BAD_ARGUMENTS';
    end if;

    select * into b from public.bookings where id = p_booking for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if b.status <> 'pending' then raise exception 'BOOKING_CLOSED'; end if;

    new_admin := b.admin_decision;
    new_dev   := b.developer_decision;
    if p_side = 'admin' then new_admin := p_decision; else new_dev := p_decision; end if;

    new_status := case
        when new_admin = 'rejected' or new_dev = 'rejected' then 'rejected'
        when new_admin = 'approved' and new_dev = 'approved' then 'approved'
        else 'pending'
    end;

    new_assign := b.assignment_id;
    if new_status = 'approved' then
        if b.ends_on is not null and b.ends_on < today then raise exception 'BOOKING_EXPIRED'; end if;
        if not exists (select 1 from public.creatives c where c.id = b.creative_id and c.status = 'approved') then
            raise exception 'CREATIVE_NOT_APPROVED';
        end if;
        if exists (
            select 1 from public.bookings o
            where o.placement_id = b.placement_id and o.status = 'approved' and o.id <> b.id
        ) then
            raise exception 'PLACEMENT_TAKEN';
        end if;

        start_now := b.starts_on is null or b.starts_on <= today;
        if start_now then
            -- Whatever the developer had on this placement is retired, not deleted.
            update public.assignments set active = false
            where placement_id = b.placement_id and active;
        end if;

        insert into public.assignments (placement_id, creative_id, owner_id, active)
        values (b.placement_id, b.creative_id, b.developer_id, start_now)
        returning id into new_assign;
    end if;

    update public.bookings set
        admin_decision     = new_admin,
        developer_decision = new_dev,
        status             = new_status,
        assignment_id      = new_assign,
        started_at         = case when new_status = 'approved' and start_now then now() else started_at end,
        decision_note      = case when p_decision = 'rejected' then left(nullif(btrim(p_note), ''), 500)
                                  else decision_note end,
        decided_at         = case when new_status <> 'pending' then now() else decided_at end
    where id = b.id;

    return new_status;
end;
$$;

-- ------------------------------------------------------------ the schedule
-- Ends bookings past their end date (the placement goes back to its fallback) and
-- starts approved bookings whose day has come. Returns how many it changed.
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
        select id, assignment_id, placement_id from public.bookings
        where status = 'approved' and started_at is null and assignment_id is not null
          and (starts_on is null or starts_on <= today)
        for update skip locked
    loop
        update public.assignments set active = false where placement_id = b.placement_id and active;
        update public.assignments set active = true where id = b.assignment_id;
        update public.bookings set started_at = now() where id = b.id;
        changed := changed + 1;
    end loop;

    return changed;
end;
$$;

-- ------------------------------------------------------------ applications
create or replace function public.decide_role_request(p_request uuid, p_decision text, p_note text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
    r public.role_requests%rowtype;
begin
    if p_decision not in ('approved', 'rejected') then raise exception 'BAD_ARGUMENTS'; end if;

    select * into r from public.role_requests where id = p_request for update;
    if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
    if r.status <> 'pending' then raise exception 'REQUEST_CLOSED'; end if;

    if p_decision = 'approved' then
        update public.accounts
        set company = r.company,
            role = case when role = 'developer' then 'advertiser'::public.account_role else role end
        where id = r.account_id;
    end if;

    update public.role_requests set
        status      = p_decision,
        review_note = case when p_decision = 'rejected' then left(nullif(btrim(p_note), ''), 500) end,
        reviewed_at = now()
    where id = r.id;

    return p_decision;
end;
$$;

revoke execute on function public.decide_booking(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.sync_booking_schedule() from public, anon, authenticated;
revoke execute on function public.decide_role_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_booking(uuid, text, text, text) to service_role;
grant execute on function public.sync_booking_schedule() to service_role;
grant execute on function public.decide_role_request(uuid, text, text) to service_role;

insert into public.schema_versions (version, name)
values ('0013', '0013_process_gaps')
on conflict (version) do nothing;
