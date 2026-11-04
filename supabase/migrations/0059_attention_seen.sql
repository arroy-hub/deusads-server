-- DeusADS 0059 - which 'Needs action' items of the bell a person has already opened
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- An advertiser's bell lists what needs action (rejected creatives, format gaps, limited campaigns, reports, campaigns
-- about to end). It is a notification, not a to-do list: once the person opens an item and sees the problem, it leaves
-- the bell and the counter goes down. It comes back only when it changes in a way that matters (another format is
-- missing, the campaign gets another end date, ...), which the server tells by a short signature of the item.
--
--   attention_seen   one row per account and signature of an item that was opened. Written by the server only.
--
-- Until this is applied the bell lists the items as before and nothing is remembered.

create table if not exists public.attention_seen (
    account_id uuid not null references public.accounts (id) on delete cascade,
    sig        text not null check (char_length(sig) between 1 and 200),
    seen_at    timestamptz not null default now(),
    primary key (account_id, sig)
);
alter table public.attention_seen enable row level security;
revoke all on public.attention_seen from public, anon, authenticated;

insert into public.schema_versions (version, name)
values ('0059', '0059_attention_seen')
on conflict (version) do nothing;
