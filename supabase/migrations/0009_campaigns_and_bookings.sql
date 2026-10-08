-- DeusADS 0009 — campaigns and bookings (stage B of the advertiser cabinet)
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0008 (roles and moderation).
--
--   campaigns  an advertiser's named group of bookings
--   bookings   one creative on one placement, waiting for two approvals:
--              DeusADS (admin_decision) and the placement's developer
--              (developer_decision). Both approved -> status 'approved' and the
--              creative is put on the placement as the active assignment, so
--              GET /v1/manifest needs no change. Either side rejecting ends it.
--
-- Nothing here is writable by users directly: the dashboard writes with the
-- service role after checking who is calling, and the two functions below do the
-- state changes in one transaction (row locked, so two approvals made at the same
-- moment cannot both activate a placement). Users may only read the rows that
-- concern them.

create table if not exists public.campaigns (
    id            uuid primary key default gen_random_uuid(),
    advertiser_id uuid not null references public.accounts(id) on delete cascade,
    name          text not null check (char_length(name) between 1 and 120),
    created_at    timestamptz not null default now()
);
create index if not exists campaigns_advertiser_idx on public.campaigns (advertiser_id, created_at desc);

create table if not exists public.bookings (
    id                 uuid primary key default gen_random_uuid(),
    campaign_id        uuid not null references public.campaigns(id) on delete cascade,
    advertiser_id      uuid not null references public.accounts(id) on delete cascade,
    developer_id       uuid not null references public.accounts(id) on delete cascade,
    creative_id        uuid not null references public.creatives(id) on delete cascade,
    placement_id       uuid not null references public.placements(id) on delete cascade,
    status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected', 'cancelled')),
    admin_decision     text not null default 'pending'
                       check (admin_decision in ('pending', 'approved', 'rejected')),
    developer_decision text not null default 'pending'
                       check (developer_decision in ('pending', 'approved', 'rejected')),
    decision_note      text,
    assignment_id      uuid references public.assignments(id) on delete set null,
    created_at         timestamptz not null default now(),
    decided_at         timestamptz
);
create index if not exists bookings_advertiser_idx on public.bookings (advertiser_id, created_at desc);
create index if not exists bookings_developer_idx  on public.bookings (developer_id, created_at desc);
create index if not exists bookings_placement_idx  on public.bookings (placement_id);
create index if not exists bookings_pending_idx    on public.bookings (created_at) where status = 'pending';
-- A placement carries at most one approved booking at a time.
create unique index if not exists bookings_one_approved_per_placement
    on public.bookings (placement_id) where status = 'approved';

alter table public.campaigns enable row level security;
alter table public.bookings  enable row level security;

drop policy if exists campaigns_advertiser_read on public.campaigns;
create policy campaigns_advertiser_read on public.campaigns
    for select to authenticated using (advertiser_id = (select auth.uid()));

drop policy if exists bookings_party_read on public.bookings;
create policy bookings_party_read on public.bookings
    for select to authenticated
    using (advertiser_id = (select auth.uid()) or developer_id = (select auth.uid()));

revoke all on public.campaigns, public.bookings from public, anon, authenticated;
grant select on public.campaigns, public.bookings to authenticated;

-- ------------------------------------------------------------------ decide
-- One side (admin or developer) approves or rejects a pending booking.
-- Returns the booking's new status. Raises BOOKING_NOT_FOUND, BOOKING_CLOSED,
-- CREATIVE_NOT_APPROVED or PLACEMENT_TAKEN, which the dashboard turns into messages.
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
    new_admin  text;
    new_dev    text;
    new_status text;
    new_assign uuid;
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
        if not exists (select 1 from public.creatives c where c.id = b.creative_id and c.status = 'approved') then
            raise exception 'CREATIVE_NOT_APPROVED';
        end if;
        if exists (
            select 1 from public.bookings o
            where o.placement_id = b.placement_id and o.status = 'approved' and o.id <> b.id
        ) then
            raise exception 'PLACEMENT_TAKEN';
        end if;

        -- Whatever the developer had on this placement is retired, not deleted.
        update public.assignments set active = false
        where placement_id = b.placement_id and active;

        insert into public.assignments (placement_id, creative_id, owner_id, active)
        values (b.placement_id, b.creative_id, b.developer_id, true)
        returning id into new_assign;
    end if;

    update public.bookings set
        admin_decision     = new_admin,
        developer_decision = new_dev,
        status             = new_status,
        assignment_id      = new_assign,
        decision_note      = case when p_decision = 'rejected' then left(nullif(btrim(p_note), ''), 500)
                                  else decision_note end,
        decided_at         = case when new_status <> 'pending' then now() else decided_at end
    where id = b.id;

    return new_status;
end;
$$;

-- ------------------------------------------------------------------ cancel
-- The advertiser withdraws a pending or approved booking; if it was live, the
-- placement goes back to the developer's fallback texture.
create or replace function public.cancel_booking(p_booking uuid, p_advertiser uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
    b public.bookings%rowtype;
begin
    select * into b from public.bookings where id = p_booking and advertiser_id = p_advertiser for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if b.status not in ('pending', 'approved') then raise exception 'BOOKING_CLOSED'; end if;

    if b.assignment_id is not null then
        update public.assignments set active = false where id = b.assignment_id;
    end if;

    update public.bookings set status = 'cancelled', decided_at = now() where id = b.id;
    return 'cancelled';
end;
$$;

-- -------------------------------------------------------------------- stop
-- The developer takes a live booking off their placement. It ends as rejected on
-- the developer's side, and the advertiser sees the reason.
create or replace function public.stop_booking(p_booking uuid, p_developer uuid, p_note text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
    b public.bookings%rowtype;
begin
    select * into b from public.bookings where id = p_booking and developer_id = p_developer for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if b.status <> 'approved' then raise exception 'BOOKING_CLOSED'; end if;

    if b.assignment_id is not null then
        update public.assignments set active = false where id = b.assignment_id;
    end if;

    update public.bookings set
        status = 'rejected',
        developer_decision = 'rejected',
        decision_note = coalesce(left(nullif(btrim(p_note), ''), 500), 'Stopped by the developer'),
        decided_at = now()
    where id = b.id;
    return 'rejected';
end;
$$;

revoke execute on function public.decide_booking(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_booking(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.stop_booking(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.decide_booking(uuid, text, text, text) to service_role;
grant execute on function public.cancel_booking(uuid, uuid) to service_role;
grant execute on function public.stop_booking(uuid, uuid, text) to service_role;
