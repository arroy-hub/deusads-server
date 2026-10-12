-- DeusADS 0024 — SDK signal, "since your last visit", and reports about creatives (Disputes)
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0023 (and everything before it).
--
--   1. games.last_signal_at: when the SDK last asked the server for anything (manifest, events, placements).
--      The dashboard shows "Connected", "Waiting for the SDK" or "No signal for N days" from it.
--   2. accounts: when the person's current visit started, when they were last active, and the end of the
--      previous visit ("since your last visit" on My games); plus when they dismissed that summary.
--   3. creative_disputes: a developer reports a creative running in their game. An admin removes the creative
--      (it is rejected everywhere; bookings are not changed) or dismisses the report, and the developer is told.

-- ------------------------------------------------------------ 1. SDK signal
alter table public.games add column if not exists last_signal_at timestamptz;

-- Until now the best guess was the last view or the last Send placements.
update public.games g
set last_signal_at = s.t
from (
    select x.id,
           greatest(
               (select max(i.occurred_at) from public.impressions i where i.game_id = x.id),
               (select max(p.last_seen_at) from public.placements p where p.game_id = x.id)
           ) as t
    from public.games x
) s
where s.id = g.id and g.last_signal_at is null and s.t is not null;

-- ------------------------------------------------------------ 2. visits
alter table public.accounts
    add column if not exists visit_at            timestamptz,
    add column if not exists visit_active_at     timestamptz,
    add column if not exists since_at            timestamptz,
    add column if not exists digest_dismissed_at timestamptz;

-- ------------------------------------------------------------ 3. reports about creatives
create table if not exists public.creative_disputes (
    id           uuid primary key default gen_random_uuid(),
    game_id      uuid not null references public.games (id) on delete cascade,
    developer_id uuid not null references public.accounts (id) on delete cascade,
    creative_id  uuid not null references public.creatives (id) on delete cascade,
    campaign_id  uuid references public.campaigns (id) on delete set null,
    reason       text not null check (char_length(reason) between 1 and 120),
    comment      text check (char_length(comment) <= 1000),
    status       text not null default 'open' check (status in ('open', 'resolved')),
    outcome      text check (outcome in ('removed', 'dismissed')),
    resolved_by  uuid references public.accounts (id) on delete set null,
    resolved_at  timestamptz,
    created_at   timestamptz not null default now(),
    check ((status = 'open') = (outcome is null))
);
-- One open report per creative per game and developer: sending it again changes nothing.
create unique index if not exists creative_disputes_one_open
    on public.creative_disputes (game_id, developer_id, creative_id) where status = 'open';
create index if not exists creative_disputes_status_idx on public.creative_disputes (status, created_at desc);
create index if not exists creative_disputes_developer_idx on public.creative_disputes (developer_id, resolved_at desc);

alter table public.creative_disputes enable row level security;
do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creative_disputes' and policyname = 'creative_disputes_owner_read') then
        create policy creative_disputes_owner_read on public.creative_disputes
            for select to authenticated using (developer_id = (select auth.uid()));
    end if;
end $$;
-- Written only by the dashboard (service role), which checks who is calling.
revoke all on public.creative_disputes from public, anon, authenticated;
grant select on public.creative_disputes to authenticated;

insert into public.schema_versions (version, name)
values ('0024', '0024_digest_signal_disputes')
on conflict (version) do nothing;
