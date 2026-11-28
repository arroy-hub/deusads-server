-- DeusADS 0068 - payouts to developers
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again. Needs 0061 (the wallet).
--
-- Once a month, on the 1st, a developer whose balance has reached the minimum is paid the whole balance. During the
-- pilot credits are demo units, so the payout is a demo too: it is written down, the balance starts again from zero,
-- and no money is sent. A developer's balance is what their games earned minus what was paid out.
--
--   wallet_payouts   one row per developer and payout day: the amount (the developer's part, in credits) and
--                    whether it was a demo. Only the server reads and writes it.
--
-- The code that ran before this file keeps working with it applied.

create table if not exists public.wallet_payouts (
    id            bigint generated always as identity primary key,
    developer_id  uuid           not null references public.accounts (id) on delete cascade,
    day           date           not null,
    amount        numeric(16, 4) not null check (amount > 0),
    demo          boolean        not null default true,
    created_at    timestamptz    not null default now(),
    unique (developer_id, day)
);
create index if not exists wallet_payouts_developer_idx on public.wallet_payouts (developer_id, day desc);

alter table public.wallet_payouts enable row level security;
revoke all on public.wallet_payouts from public, anon, authenticated;
grant all on public.wallet_payouts to service_role;

insert into public.schema_versions (version, name)
values ('0068', '0068_wallet_payouts')
on conflict (version) do nothing;
