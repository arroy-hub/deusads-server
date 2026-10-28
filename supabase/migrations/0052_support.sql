-- DeusADS 0052 — support: requests to the admin, folders, screenshots and the assistant's data
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0001 (accounts) and everything before it. Only adds tables and a storage bucket.
--
--   support_requests     one conversation between a developer or advertiser and the admin. A problem, a
--                        question or an idea, with a status (new, answered, noted, resolved). Which status
--                        a type may have is enforced in the dashboard's code (lib/support-rules.js), not here:
--                        changing a request's type must never change its status.
--   support_messages     the messages of a request: from the user, the developer (admin), the assistant,
--                        the system ("sent to the developer") and internal notes only admins see.
--   support_attachments  screenshots of a message, stored in the private `support` bucket.
--   support_folders      a person's own folders for their requests.
--   support_bot_settings the assistant's settings (one row, edited by the admin).
--   support_articles     the guide the assistant answers from.
--   support_bot_log      what the assistant did with each question (outcome, source, confidence, rating).
--
-- A person reads only their own requests, their messages (never internal notes), their folders and their
-- screenshots. Everything is written by the dashboard's server code with the service role after it has
-- checked who is asking, so no write policy exists for users. Admins use the service role as well.
--
-- Until this is applied the dashboard works as before; the Help & feedback page says the database needs
-- the update.

-- ---------------------------------------------------------------- folders

create table if not exists public.support_folders (
    id         uuid        primary key default gen_random_uuid(),
    owner_id   uuid        not null references public.accounts (id) on delete cascade,
    name       text        not null check (char_length(name) between 1 and 40),
    position   integer     not null default 0,
    created_at timestamptz not null default now()
);
create index if not exists support_folders_owner_idx on public.support_folders (owner_id);

-- ---------------------------------------------------------------- requests

create table if not exists public.support_requests (
    id              uuid        primary key default gen_random_uuid(),
    number          bigint      generated always as identity,
    owner_id        uuid        not null references public.accounts (id) on delete cascade,
    type            text        not null check (type in ('bug', 'question', 'idea')),
    title           text        not null check (char_length(title) between 1 and 140),
    status          text        not null default 'new' check (status in ('new', 'answered', 'noted', 'resolved')),
    resolved_by     text        check (resolved_by in ('assistant', 'developer')),
    folder_id       uuid        references public.support_folders (id) on delete set null,
    position        integer     not null default 0,
    created_via     text        not null default 'form' check (created_via in ('form', 'assistant')),
    escalation      text        check (escalation is null or char_length(escalation) <= 120),
    context         jsonb       not null default '{}'::jsonb,
    user_unread     boolean     not null default false,
    admin_unread    boolean     not null default true,
    created_at      timestamptz not null default now(),
    last_message_at timestamptz not null default now(),
    status_changed_at timestamptz not null default now()
);
create unique index if not exists support_requests_number_idx on public.support_requests (number);
create index if not exists support_requests_owner_idx on public.support_requests (owner_id, last_message_at desc);
create index if not exists support_requests_status_idx on public.support_requests (status, created_at);
create index if not exists support_requests_folder_idx on public.support_requests (folder_id) where folder_id is not null;

-- ---------------------------------------------------------------- messages and screenshots

create table if not exists public.support_messages (
    id         uuid        primary key default gen_random_uuid(),
    request_id uuid        not null references public.support_requests (id) on delete cascade,
    kind       text        not null check (kind in ('user', 'developer', 'bot', 'system', 'note')),
    author_id  uuid        references public.accounts (id) on delete set null,
    body       text        not null default '' check (char_length(body) <= 6000),
    created_at timestamptz not null default now()
);
create index if not exists support_messages_request_idx on public.support_messages (request_id, created_at);

create table if not exists public.support_attachments (
    id         uuid        primary key default gen_random_uuid(),
    message_id uuid        not null references public.support_messages (id) on delete cascade,
    path       text        not null check (char_length(path) <= 300),
    mime       text        not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
    size       integer     not null check (size between 1 and 5242880),
    created_at timestamptz not null default now()
);
create index if not exists support_attachments_message_idx on public.support_attachments (message_id);

-- ---------------------------------------------------------------- the assistant

create table if not exists public.support_bot_settings (
    id         boolean     primary key default true check (id),
    settings   jsonb       not null default '{}'::jsonb,
    enabled    boolean     not null default false,
    updated_at timestamptz not null default now()
);
insert into public.support_bot_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.support_articles (
    id         uuid        primary key default gen_random_uuid(),
    title      text        not null check (char_length(title) between 1 and 160),
    keywords   text        not null default '' check (char_length(keywords) <= 300),
    answer     text        not null check (char_length(answer) between 1 and 2000),
    more       text        not null default '' check (char_length(more) <= 2000),
    enabled    boolean     not null default true,
    uses       integer     not null default 0,
    updated_at timestamptz not null default now()
);

create table if not exists public.support_bot_log (
    id         uuid        primary key default gen_random_uuid(),
    owner_id   uuid        references public.accounts (id) on delete set null,
    request_id uuid        references public.support_requests (id) on delete set null,
    question   text        not null check (char_length(question) <= 1000),
    outcome    text        not null check (outcome in ('answered', 'clarified', 'escalated', 'grouped', 'drafted')),
    article_id uuid        references public.support_articles (id) on delete set null,
    confidence integer     check (confidence between 0 and 100),
    reason     text        check (reason is null or char_length(reason) <= 120),
    rating     text        check (rating in ('up', 'down')),
    tokens_in  integer     not null default 0,
    tokens_out integer     not null default 0,
    created_at timestamptz not null default now()
);
create index if not exists support_bot_log_owner_idx on public.support_bot_log (owner_id, created_at desc);
create index if not exists support_bot_log_time_idx on public.support_bot_log (created_at desc);
create index if not exists support_bot_log_request_idx on public.support_bot_log (request_id) where request_id is not null;
create index if not exists support_bot_log_article_idx on public.support_bot_log (article_id) where article_id is not null;

-- ---------------------------------------------------------------- row-level security

alter table public.support_folders      enable row level security;
alter table public.support_requests     enable row level security;
alter table public.support_messages     enable row level security;
alter table public.support_attachments  enable row level security;
alter table public.support_bot_settings enable row level security;
alter table public.support_articles     enable row level security;
alter table public.support_bot_log      enable row level security;

drop policy if exists support_folders_own on public.support_folders;
create policy support_folders_own on public.support_folders
    for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists support_requests_own on public.support_requests;
create policy support_requests_own on public.support_requests
    for select to authenticated using (owner_id = (select auth.uid()));

-- Internal notes never reach the person.
drop policy if exists support_messages_own on public.support_messages;
create policy support_messages_own on public.support_messages
    for select to authenticated
    using (
        kind <> 'note'
        and exists (select 1 from public.support_requests r where r.id = request_id and r.owner_id = (select auth.uid()))
    );

drop policy if exists support_attachments_own on public.support_attachments;
create policy support_attachments_own on public.support_attachments
    for select to authenticated
    using (
        exists (
            select 1
            from public.support_messages m
            join public.support_requests r on r.id = m.request_id
            where m.id = message_id and m.kind <> 'note' and r.owner_id = (select auth.uid())
        )
    );

-- The assistant's settings, guide and log have no user policy: the service role only.
revoke all on public.support_folders, public.support_requests, public.support_messages, public.support_attachments,
              public.support_bot_settings, public.support_articles, public.support_bot_log
    from public, anon, authenticated;
grant select on public.support_folders, public.support_requests, public.support_messages, public.support_attachments
    to authenticated;

-- ---------------------------------------------------------------- screenshots: a private bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

insert into public.schema_versions (version, name)
values ('0052', '0052_support')
on conflict (version) do nothing;
