-- DeusADS — initial schema
--
-- Design rules that must survive into later versions:
--   1. every row has an owner (owner_id) from the start, even while there is one user;
--   2. access is enforced by row-level security in the database, never only in the UI;
--   3. creatives carry a status so a moderation queue can be added without a migration of data;
--   4. accounts carry a role so advertiser access can be added without splitting a superuser.
--
-- Written for Supabase: auth.users and auth.uid() come from its auth schema.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- accounts

create type account_role as enum ('developer', 'advertiser', 'admin');

-- One row per signed-up person, mirroring auth.users.
create table accounts (
    id          uuid primary key references auth.users (id) on delete cascade,
    email       text        not null,
    company     text,
    role        account_role not null default 'developer',
    created_at  timestamptz not null default now()
);

-- A new sign-up gets an accounts row automatically, so the dashboard never
-- has to cope with a logged-in user that has no profile.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into accounts (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- ---------------------------------------------------------------- games

-- A game is what the SDK authenticates as. api_key is the value the developer
-- pastes into Unity; it is the only secret the SDK carries.
create table games (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid        not null references accounts (id) on delete cascade,
    name        text        not null,
    engine      text        not null default 'unity',
    api_key     text        not null unique default encode(gen_random_bytes(24), 'hex'),
    created_at  timestamptz not null default now()
);

create index games_owner_idx on games (owner_id);

-- ---------------------------------------------------------------- placements

-- One row per banner in the game's scenes. The SDK generates external_id
-- itself and reports the rest, so the developer types nothing.
create table placements (
    id            uuid primary key default gen_random_uuid(),
    game_id       uuid        not null references games (id) on delete cascade,
    owner_id      uuid        not null references accounts (id) on delete cascade,
    external_id   text        not null,
    label         text,
    scene         text,
    aspect_ratio  numeric(6, 3),
    width_m       numeric(8, 3),
    height_m      numeric(8, 3),
    preview_path  text,
    first_seen_at timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    unique (game_id, external_id)
);

create index placements_game_idx on placements (game_id);

-- ---------------------------------------------------------------- creatives

-- 'approved' is the only status used before moderation exists, but the column
-- is here so the queue can be switched on without touching existing rows.
create type creative_status as enum ('draft', 'pending', 'approved', 'rejected');

create table creatives (
    id           uuid primary key default gen_random_uuid(),
    owner_id     uuid        not null references accounts (id) on delete cascade,
    name         text        not null,
    storage_path text        not null,
    width_px     integer,
    height_px    integer,
    status       creative_status not null default 'approved',
    created_at   timestamptz not null default now()
);

create index creatives_owner_idx on creatives (owner_id);

-- ---------------------------------------------------------------- assignments

-- Which creative a placement currently shows. One active row per placement;
-- history is kept so a past campaign can still be explained.
create table assignments (
    id           uuid primary key default gen_random_uuid(),
    placement_id uuid        not null references placements (id) on delete cascade,
    creative_id  uuid        not null references creatives (id) on delete cascade,
    owner_id     uuid        not null references accounts (id) on delete cascade,
    active       boolean     not null default true,
    created_at   timestamptz not null default now()
);

create unique index assignments_one_active_per_placement
    on assignments (placement_id) where active;

-- ---------------------------------------------------------------- impressions

create table impressions (
    id              bigserial primary key,
    game_id         uuid        not null references games (id) on delete cascade,
    owner_id        uuid        not null references accounts (id) on delete cascade,
    placement_id    uuid        references placements (id) on delete set null,
    creative_id     uuid        references creatives (id) on delete set null,
    session_id      text        not null,
    sdk_version     text,
    visible_seconds numeric(6, 2),
    occurred_at     timestamptz not null,
    received_at     timestamptz not null default now()
);

create index impressions_game_time_idx on impressions (game_id, occurred_at desc);

-- The SDK counts one impression per placement per session, so a repeat is a
-- retry or a replayed batch rather than a new view. Dropping it here keeps the
-- count honest even if the network layer sends a batch twice.
create unique index impressions_dedupe
    on impressions (game_id, session_id, placement_id, creative_id);

-- ---------------------------------------------------------------- security

alter table accounts    enable row level security;
alter table games       enable row level security;
alter table placements  enable row level security;
alter table creatives   enable row level security;
alter table assignments enable row level security;
alter table impressions enable row level security;

create policy accounts_self on accounts
    for all using (id = auth.uid()) with check (id = auth.uid());

create policy games_owner on games
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy placements_owner on placements
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy creatives_owner on creatives
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy assignments_owner on assignments
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Impressions are written by the SDK through the service role and are
-- read-only in the dashboard.
create policy impressions_owner_read on impressions
    for select using (owner_id = auth.uid());

-- ---------------------------------------------------------------- views

-- Daily totals per placement, used by the dashboard's impressions screen.
create view impression_daily as
select
    i.owner_id,
    i.game_id,
    i.placement_id,
    date_trunc('day', i.occurred_at) as day,
    count(*)                         as impressions,
    count(distinct i.session_id)     as sessions
from impressions i
group by i.owner_id, i.game_id, i.placement_id, date_trunc('day', i.occurred_at);
