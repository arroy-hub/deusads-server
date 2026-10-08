-- DeusADS 0008 — roles and moderation (stage A of the advertiser cabinet)
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
--
--   1. Creatives get a reviewer's note and a review time.
--   2. A creative uploaded by an advertiser starts as 'pending'; developers' own
--      creatives keep starting as 'approved'. Only approved creatives reach the
--      manifest (GET /v1/manifest), so a pending or rejected one is never served.
--   3. A partial index keeps the moderation queue cheap to read.
--
-- Roles are not changed here. Everyone who signs up is a developer
-- (handle_new_user); advertiser and admin are given by an admin in the dashboard,
-- which uses the service role. accounts.role cannot be edited by users (0004).
--
-- The first admin is set by hand, once:
--   update public.accounts set role = 'admin' where email = '<your email>';

alter table public.creatives add column if not exists review_note text;
alter table public.creatives add column if not exists reviewed_at timestamptz;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.creative_default_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (
        select 1 from public.accounts a
        where a.id = new.owner_id and a.role = 'advertiser'
    ) then
        new.status := 'pending';
    end if;
    return new;
end;
$$;

create or replace trigger creatives_default_status
    before insert on public.creatives
    for each row execute function private.creative_default_status();

create index if not exists creatives_pending_idx
    on public.creatives (created_at)
    where status = 'pending';
