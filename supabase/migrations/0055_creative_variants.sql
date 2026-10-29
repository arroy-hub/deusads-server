-- DeusADS 0055 - GPU-compressed copies of creative pictures (ASTC), for headsets and phones
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
--
--   creative_variants: one row per prepared copy of a picture. The server makes ASTC 4x4 copies at a few sizes
--     (up to 1024, 2048 and 4096 px on the longest side, never bigger than the picture itself) with all their mip levels,
--     so the SDK can hand the file to the graphics card as it is: a quarter of the memory of a PNG decoded to RGBA32,
--     and no decoding on the main thread. source_path is the picture's path in the "creatives" bucket; the copies are
--     files in the "variants" bucket. Only the server writes here (service role); nobody reads the table directly.
--   "variants" bucket: public, any file type, up to 32 MB.
--   "creatives" bucket: limit raised from 8 MB to 16 MB, because a picture the server made smaller (the 4096 px limit)
--     is written there and a PNG of a photo can come out above 8 MB. The cabinet still refuses uploads over 8 MB.
--
-- Until this is applied nothing visible changes: the manifest simply lists no variants and the SDK keeps using the PNG or JPG.

create table if not exists public.creative_variants (
    id           uuid primary key default gen_random_uuid(),
    source_path  text not null,
    format       text not null default 'astc4x4' check (format in ('astc4x4')),
    width        integer not null check (width > 0),
    height       integer not null check (height > 0),
    mips         smallint not null check (mips >= 1),
    bytes        integer not null check (bytes > 0),
    alpha        boolean not null default false,
    storage_path text not null,
    created_at   timestamptz not null default now(),
    unique (source_path, format, width)
);

create index if not exists creative_variants_source_idx on public.creative_variants (source_path);

alter table public.creative_variants enable row level security;
-- no policies and no grants: the service role bypasses row-level security, everyone else sees nothing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('variants', 'variants', true, 33554432, null)
on conflict (id) do update set public = true, file_size_limit = 33554432, allowed_mime_types = null;

update storage.buckets set file_size_limit = 16777216 where id = 'creatives';

insert into public.schema_versions (version, name)
values ('0055', '0055_creative_variants')
on conflict (version) do nothing;
