-- DeusADS 0028 — advertiser cabinet: creative folders and order, framing per ad shape, pause until a date
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again. Needs 0017 (creatives) and 0026 (campaigns).
--
--   creative_folders      the advertiser's own folders in the Creatives library (one level, a name each).
--   creatives.folder_id   the folder a creative sits in; deleting a folder only empties it (the creative stays).
--   creatives.sort_index  the advertiser's own order: 0, 1, 2 ... Empty for a creative nobody has put in order;
--                         those come after the ordered ones, newest first.
--   creatives.format_crops  how the advertiser framed the main picture for each ad shape, e.g.
--                         {"r16x9": {"zoom": 1.4, "x": 0.5, "y": 0.4}}. A shape without an entry keeps the automatic crop.
--   campaigns.resume_on   a pause that ends by itself: from this day on the campaign is served again.
--                         Empty while paused means "until the advertiser resumes it".
--
-- Until this is applied nothing breaks: the library shows creatives newest first without folders, a custom
-- framing is not saved, and a pause lasts until it is lifted by hand.

alter table public.creatives
    add column if not exists folder_id    uuid,
    add column if not exists sort_index   integer,
    add column if not exists format_crops jsonb;

alter table public.campaigns
    add column if not exists resume_on date;

create table if not exists public.creative_folders (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid not null references public.accounts (id),
    name       text not null check (char_length(name) between 1 and 80),
    created_at timestamptz not null default now()
);

create unique index if not exists creative_folders_name_idx on public.creative_folders (owner_id, lower(name));
create index if not exists creative_folders_owner_idx on public.creative_folders (owner_id);

do $$
begin
    -- deleting a folder only empties folder_id of its creatives
    if not exists (select 1 from pg_constraint where conname = 'creatives_folder_fkey') then
        alter table public.creatives add constraint creatives_folder_fkey
            foreign key (folder_id) references public.creative_folders (id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'creatives_format_crops_object') then
        alter table public.creatives add constraint creatives_format_crops_object
            check (format_crops is null or jsonb_typeof(format_crops) = 'object');
    end if;
end $$;

create index if not exists creatives_folder_idx on public.creatives (folder_id) where folder_id is not null;

alter table public.creative_folders enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creative_folders' and policyname = 'creative_folders_owner') then
        create policy creative_folders_owner on public.creative_folders
            for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
    end if;
end $$;

revoke all on public.creative_folders from anon;
grant select, insert, update, delete on public.creative_folders to authenticated;

insert into public.schema_versions (version, name)
values ('0028', '0028_cabinet_redesign')
on conflict (version) do nothing;
