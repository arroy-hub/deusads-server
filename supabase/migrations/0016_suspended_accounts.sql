-- DeusADS 0016 — a suspended account cannot get a booking approved
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0015.
--
-- The dashboard and the manifest already ignore a suspended account (accounts.suspended_at).
-- This puts the same rule inside activate_booking(), so a booking by or on a suspended
-- advertiser or developer is rejected even if it reaches the database some other way.
-- Nothing else changes: the function is 0015's, with one more condition.

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
        select 1 from public.accounts a
        where a.id in (b.advertiser_id, b.developer_id) and a.suspended_at is not null
    ) then
        reason := 'This account is suspended';
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

revoke execute on function public.activate_booking(uuid) from public, anon, authenticated;
grant execute on function public.activate_booking(uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0016', '0016_suspended_accounts')
on conflict (version) do nothing;
