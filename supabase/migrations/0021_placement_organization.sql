-- DeusADS 0021 — organising many placements: places, folders, tags, switches, place type
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0020 (and everything before it). Only adds things: nothing existing changes meaning.
--
-- A developer can have hundreds of placements. This gives the dashboard what it needs to group,
-- find and switch them:
--
--   1. placement_places: where a placement stands in the game (scene + path in the hierarchy).
--      A shared placement (copies of one prefab, one ID) has one row per copy; a unique one has one.
--      Filled by the SDK when it sends placements. Impressions point at the place they came from.
--   2. placements.shared: true for copies of a prefab sharing one ID (what every existing placement
--      is), false for a placement with its own ID.
--   3. placement_folders (one level now; parent_id keeps nesting possible later) and
--      placements.folder_id. A placement is in at most one folder.
--   4. placements.tags: free labels for search and selection. Tags have no switch of their own.
--   5. Switches. placements.enabled (the placement itself), placement_folders.enabled (a whole folder)
--      and placement_scene_off (a scene is off: every copy standing in that scene, whenever added).
--      A placement shows nothing when any of them is off ("off wins"). The manifest says what is off.
--   6. placements.place_type (set by the developer) and place_type_suggested (set by the server from
--      scene and object names). The dashboard shows the first that is set.
--   7. impressions.place_id and game_place_stats(): views per place of a game.
--
-- Until this is applied nothing breaks: the SDK endpoints skip the new fields and the dashboard
-- shows the placement list as before.

-- ------------------------------------------------------------ folders
create table if not exists public.placement_folders (
    id         uuid primary key default gen_random_uuid(),
    game_id    uuid not null references public.games (id) on delete cascade,
    owner_id   uuid not null references public.accounts (id),
    name       text not null check (char_length(name) between 1 and 80),
    parent_id  uuid references public.placement_folders (id) on delete cascade,
    enabled    boolean not null default true,
    created_at timestamptz not null default now(),
    unique (id, game_id)
);

create unique index if not exists placement_folders_name_idx
    on public.placement_folders (game_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists placement_folders_game_idx   on public.placement_folders (game_id);
create index if not exists placement_folders_owner_idx  on public.placement_folders (owner_id);
create index if not exists placement_folders_parent_idx on public.placement_folders (parent_id);

-- ------------------------------------------------------------ placements: new columns
alter table public.placements
    add column if not exists shared boolean not null default true,
    add column if not exists enabled boolean not null default true,
    add column if not exists folder_id uuid,
    add column if not exists tags text[] not null default '{}',
    add column if not exists place_type text,
    add column if not exists place_type_suggested text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'placements_tags_limit') then
        alter table public.placements add constraint placements_tags_limit check (cardinality(tags) <= 20);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'placements_place_type_length') then
        alter table public.placements add constraint placements_place_type_length
            check (place_type is null or char_length(place_type) between 1 and 40);
    end if;
    -- a folder must belong to the same game as the placement; deleting a folder only empties folder_id
    if not exists (select 1 from pg_constraint where conname = 'placements_folder_fkey') then
        alter table public.placements add constraint placements_folder_fkey
            foreign key (folder_id, game_id) references public.placement_folders (id, game_id)
            on delete set null (folder_id);
    end if;
end $$;

create index if not exists placements_folder_idx on public.placements (folder_id);
create index if not exists placements_tags_idx   on public.placements using gin (tags);

-- ------------------------------------------------------------ places
create table if not exists public.placement_places (
    id            uuid primary key default gen_random_uuid(),
    placement_id  uuid not null references public.placements (id) on delete cascade,
    game_id       uuid not null references public.games (id) on delete cascade,
    owner_id      uuid not null references public.accounts (id),
    scene         text not null default '' check (char_length(scene) <= 200),
    path          text not null default '' check (char_length(path) <= 400),
    first_seen_at timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    removed_at    timestamptz,
    unique (placement_id, scene, path)
);

create index if not exists placement_places_game_idx  on public.placement_places (game_id);
create index if not exists placement_places_owner_idx on public.placement_places (owner_id);
create index if not exists placement_places_scene_idx on public.placement_places (game_id, scene);

-- every existing placement that reported a scene gets its place
insert into public.placement_places (placement_id, game_id, owner_id, scene, path, first_seen_at, last_seen_at, removed_at)
select p.id, p.game_id, p.owner_id, coalesce(p.scene, ''), '', p.first_seen_at, p.last_seen_at, p.removed_at
from public.placements p
where p.scene is not null
on conflict (placement_id, scene, path) do nothing;

-- ------------------------------------------------------------ scenes switched off
create table if not exists public.placement_scene_off (
    game_id    uuid not null references public.games (id) on delete cascade,
    scene      text not null check (char_length(scene) between 0 and 200),
    owner_id   uuid not null references public.accounts (id),
    created_at timestamptz not null default now(),
    primary key (game_id, scene)
);

create index if not exists placement_scene_off_owner_idx on public.placement_scene_off (owner_id);

-- ------------------------------------------------------------ impressions by place
alter table public.impressions
    add column if not exists place_id uuid references public.placement_places (id) on delete set null;

create index if not exists impressions_place_idx on public.impressions (place_id) where place_id is not null;

-- ------------------------------------------------------------ row-level security
alter table public.placement_folders  enable row level security;
alter table public.placement_places   enable row level security;
alter table public.placement_scene_off enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'placement_folders' and policyname = 'placement_folders_owner') then
        create policy placement_folders_owner on public.placement_folders
            for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
    end if;
    -- places are written by the SDK through the service role; the dashboard only reads them
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'placement_places' and policyname = 'placement_places_owner_read') then
        create policy placement_places_owner_read on public.placement_places
            for select using (owner_id = (select auth.uid()));
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'placement_scene_off' and policyname = 'placement_scene_off_owner') then
        create policy placement_scene_off_owner on public.placement_scene_off
            for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
    end if;
end $$;

revoke all on public.placement_folders, public.placement_places, public.placement_scene_off from anon;
revoke insert, update, delete, truncate on public.placement_places from authenticated;
grant select, insert, update, delete on public.placement_folders   to authenticated;
grant select                         on public.placement_places    to authenticated;
grant select, insert, update, delete on public.placement_scene_off to authenticated;

-- ------------------------------------------------------------ views per place
create or replace function public.game_place_stats(p_game_id uuid, p_days integer default 30)
returns table (place_id uuid, impressions bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select i.place_id, count(*)::bigint
    from public.impressions i
    where i.game_id = p_game_id
      and i.place_id is not null
      and i.occurred_at >= (
            date_trunc('day', now() at time zone 'utc')
            - make_interval(days => least(greatest(p_days, 1), 365) - 1)
          ) at time zone 'utc'
    group by i.place_id;
$$;

revoke execute on function public.game_place_stats(uuid, integer) from public, anon;
grant execute on function public.game_place_stats(uuid, integer) to authenticated;

insert into public.schema_versions (version, name)
values ('0021', '0021_placement_organization')
on conflict (version) do nothing;
