-- DeusADS 0017 — ad formats, per-format images and a safe zone for auto-cropping
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0015 (and everything before it).
--
--   1. ad_formats: the standard shapes of an ad (16:9, 4:3, 1:1, 3:4, 9:16, 2:1, 3:1).
--      A placement belongs to the nearest format when its aspect ratio is within 15%;
--      otherwise it is a custom placement. The matching is done in code (lib/formats.js).
--   2. creative_assets: extra images of a creative made for one format, or for a custom
--      shape (format_id null). Each carries its own review status: it is a new picture a
--      reviewer has not seen. An advertiser's asset starts 'pending'; the app writes
--      'approved' straight away for developers and admins (their own pictures).
--   3. creatives.safe_x / safe_y / safe_w / safe_h: the part of the main image that must
--      stay visible when it is cropped to another shape (fractions of the image, top-left
--      origin). Default: the centre 70%. The advertiser moves and resizes it on the
--      creative's page; the server decides with it whether auto-cropping is allowed.
--
-- How the manifest picks a picture for a placement (code, not SQL):
--   a unique approved asset for the placement's format > the main image auto-cropped,
--   only if the safe zone fits the placement's shape > not covered: the creative is not
--   shown on that placement (its booking still stands).
--
-- Until the new code is deployed nothing visible changes. A database without this
-- migration still works with the new code (it falls back to the main image as before).

-- ------------------------------------------------------------ 1. formats
create table if not exists public.ad_formats (
    id     text primary key check (id ~ '^[a-z0-9_]{2,20}$'),
    label  text not null,
    aspect numeric(6, 3) not null check (aspect > 0),
    sort   integer not null default 0
);

insert into public.ad_formats (id, label, aspect, sort) values
    ('r16x9', '16:9 landscape', 1.778, 10),
    ('r4x3',  '4:3 landscape',  1.333, 20),
    ('r1x1',  '1:1 square',     1.000, 30),
    ('r3x4',  '3:4 portrait',   0.750, 40),
    ('r9x16', '9:16 tall',      0.563, 50),
    ('r2x1',  '2:1 wide',       2.000, 60),
    ('r3x1',  '3:1 banner',     3.000, 70)
on conflict (id) do nothing;

alter table public.ad_formats enable row level security;
drop policy if exists ad_formats_read on public.ad_formats;
create policy ad_formats_read on public.ad_formats
    for select to authenticated using (true);
revoke all on public.ad_formats from public, anon, authenticated;
grant select on public.ad_formats to authenticated;

-- ------------------------------------------------------------ 2. per-format images
create table if not exists public.creative_assets (
    id           uuid primary key default gen_random_uuid(),
    creative_id  uuid not null references public.creatives (id) on delete cascade,
    format_id    text references public.ad_formats (id),
    aspect       numeric(6, 3) not null check (aspect > 0),
    storage_path text not null,
    width_px     integer,
    height_px    integer,
    status       public.creative_status not null default 'pending',
    review_note  text,
    reviewed_at  timestamptz,
    created_at   timestamptz not null default now()
);

-- One image per standard format; any number of custom ones.
create unique index if not exists creative_assets_one_per_format
    on public.creative_assets (creative_id, format_id) where format_id is not null;
create index if not exists creative_assets_creative_idx on public.creative_assets (creative_id);
create index if not exists creative_assets_pending_idx on public.creative_assets (created_at) where status = 'pending';

alter table public.creative_assets enable row level security;
drop policy if exists creative_assets_owner_read on public.creative_assets;
create policy creative_assets_owner_read on public.creative_assets
    for select to authenticated
    using (exists (select 1 from public.creatives c where c.id = creative_id and c.owner_id = (select auth.uid())));
revoke all on public.creative_assets from public, anon, authenticated;
grant select on public.creative_assets to authenticated;
-- Writes go through server actions with the service role, after an ownership check.

-- ------------------------------------------------------------ 3. safe zone
alter table public.creatives add column if not exists safe_x numeric(5, 4) not null default 0.15 check (safe_x >= 0 and safe_x <= 1);
alter table public.creatives add column if not exists safe_y numeric(5, 4) not null default 0.15 check (safe_y >= 0 and safe_y <= 1);
alter table public.creatives add column if not exists safe_w numeric(5, 4) not null default 0.70 check (safe_w > 0 and safe_w <= 1);
alter table public.creatives add column if not exists safe_h numeric(5, 4) not null default 0.70 check (safe_h > 0 and safe_h <= 1);

insert into public.schema_versions (version, name)
values ('0017', '0017_ad_formats')
on conflict (version) do nothing;
