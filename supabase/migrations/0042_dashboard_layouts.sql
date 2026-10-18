-- DeusADS 0042 — the widget board ("Advanced Data") remembers its layout in the account
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0030 (accounts) and everything before it.
--
--   dashboard_layouts  one row per account and board: "developer" (a game's Performance tab and the
--                      games overview) or "advertiser" (a campaign's report). `layout` holds whether the
--                      board is open, which widgets are on it in order, and their sizes. The owner reads
--                      and writes their own row; nobody else sees it.
--
-- Until this is applied the board still works: it opens with the default widgets and does not remember
-- changes between visits.

create table if not exists public.dashboard_layouts (
    account_id uuid        not null references public.accounts (id) on delete cascade,
    kind       text        not null check (kind in ('developer', 'advertiser')),
    layout     jsonb       not null default '{}'::jsonb check (pg_column_size(layout) <= 8000),
    updated_at timestamptz not null default now(),
    primary key (account_id, kind)
);

alter table public.dashboard_layouts enable row level security;

drop policy if exists dashboard_layouts_own on public.dashboard_layouts;
create policy dashboard_layouts_own on public.dashboard_layouts
    for all to authenticated
    using (account_id = (select auth.uid()))
    with check (account_id = (select auth.uid()));

insert into public.schema_versions (version, name)
values ('0042', '0042_dashboard_layouts')
on conflict (version) do nothing;
