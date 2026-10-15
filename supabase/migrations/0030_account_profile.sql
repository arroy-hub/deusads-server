-- DeusADS 0030 — the account page: profile fields, notification choices, sessions, email sync
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0013 (notifications) and everything before it.
--
--   accounts            contact_name, avatar_path, website, country, phone, password_changed_at.
--                       A signed-in user may edit contact_name, website, country, phone and company
--                       (column grants, as in 0004). avatar_path and password_changed_at are written only
--                       by the dashboard's server code (an avatar is checked and stored there), role and
--                       suspended_at stay admin-only.
--   notification_prefs  one row per account and kind of notification: shown under the bell, sent by
--                       email. No row means the defaults (bell on, email off). The owner reads and
--                       writes their own rows; an admin edits another account's through the service role.
--   sync_account_email  when the address in auth.users changes (the person opened the confirmation
--                       link, or an admin changed it) accounts.email follows.
--   my_sessions / revoke_my_session / revoke_other_sessions / cancel_my_email_change
--                       what the Sign-in & security tab needs and Supabase's client does not offer: the
--                       list of the person's own sessions, signing one or all the others out, and
--                       withdrawing an email change that was never confirmed. All work on auth.uid() only.
--   admin_revoke_sessions  signs an account out everywhere (service role only, for the admin's page).
--
-- Until this is applied the account page still opens: the new fields show as empty and saving them
-- says the database needs the update; notifications keep their old behaviour.

-- ---------------------------------------------------------------- accounts: profile fields

alter table public.accounts
    add column if not exists contact_name        text check (contact_name is null or char_length(contact_name) <= 80),
    add column if not exists avatar_path         text check (avatar_path is null or char_length(avatar_path) <= 300),
    add column if not exists website             text check (website is null or char_length(website) <= 200),
    add column if not exists country             text check (country is null or char_length(country) <= 2),
    add column if not exists phone               text check (phone is null or char_length(phone) <= 40),
    add column if not exists password_changed_at timestamptz;

alter table public.accounts
    drop constraint if exists accounts_company_length;
alter table public.accounts
    add constraint accounts_company_length check (company is null or char_length(company) <= 120);

grant update (company, contact_name, website, country, phone) on public.accounts to authenticated;

-- ---------------------------------------------------------------- notification choices

create table if not exists public.notification_prefs (
    account_id uuid        not null references public.accounts (id) on delete cascade,
    type       text        not null check (char_length(type) between 1 and 60),
    bell       boolean     not null default true,
    email      boolean     not null default false,
    updated_at timestamptz not null default now(),
    primary key (account_id, type)
);

alter table public.notification_prefs enable row level security;

drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs
    for all to authenticated
    using (account_id = (select auth.uid()))
    with check (account_id = (select auth.uid()));

revoke all on public.notification_prefs from public, anon, authenticated;
grant select, insert, update, delete on public.notification_prefs to authenticated;

-- ---------------------------------------------------------------- email follows the sign-in address

create or replace function public.sync_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.accounts set email = new.email where id = new.id and email is distinct from new.email;
    return new;
end;
$$;

revoke execute on function public.sync_account_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.sync_account_email();

-- ---------------------------------------------------------------- the person's own sessions

create or replace function public.my_sessions()
returns table (id uuid, user_agent text, created_at timestamptz, last_seen timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
    select s.id, s.user_agent, s.created_at, coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at)
    from auth.sessions s
    where s.user_id = auth.uid()
    order by 4 desc;
$$;

create or replace function public.revoke_my_session(p_id uuid)
returns void
language sql
security definer
set search_path = public, auth
as $$
    delete from auth.sessions where id = p_id and user_id = auth.uid();
$$;

-- Signs out every session of the caller except the one passed (the one in use).
create or replace function public.revoke_other_sessions(p_keep uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    removed integer;
begin
    delete from auth.sessions where user_id = auth.uid() and id is distinct from p_keep;
    get diagnostics removed = row_count;
    return removed;
end;
$$;

-- Withdraws an email change that has not been confirmed yet; the old address stays.
create or replace function public.cancel_my_email_change()
returns void
language sql
security definer
set search_path = public, auth
as $$
    update auth.users
       set email_change = '', email_change_token_new = '', email_change_token_current = '',
           email_change_sent_at = null, email_change_confirm_status = 0
     where id = auth.uid();
$$;

-- For the admin's page: sign an account out on every device. Service role only.
create or replace function public.admin_revoke_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    removed integer;
begin
    delete from auth.sessions where user_id = p_user;
    get diagnostics removed = row_count;
    return removed;
end;
$$;

revoke execute on function public.my_sessions() from public, anon;
revoke execute on function public.revoke_my_session(uuid) from public, anon;
revoke execute on function public.revoke_other_sessions(uuid) from public, anon;
revoke execute on function public.cancel_my_email_change() from public, anon;
revoke execute on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.revoke_other_sessions(uuid) to authenticated;
grant execute on function public.cancel_my_email_change() to authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

insert into public.schema_versions (version, name)
values ('0030', '0030_account_profile')
on conflict (version) do nothing;
