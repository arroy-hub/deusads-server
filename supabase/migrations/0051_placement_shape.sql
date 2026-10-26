-- DeusADS 0051 - placement shape: how badly the picture is stretched where a placement stands
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0021 (placement organisation) and everything before it.
--
--   placement_places.shape_level: how the picture sits on the surface at that place, measured by the SDK from the baked
--     mesh when the developer presses Send placements. 0 fine, 1 stretched (shown, the developer is told), 2 too distorted
--     to be shown (the SDK leaves that copy out of the game).
--   placement_places.shape_worst: the stretch or squeeze that at least 1% of the picture suffers, 1 meaning none.
--   placements.shape_blocked: true when every place the placement stands in is too distorted. The manifest then lists the
--     placement as switched off, so no creative is served to it and it takes no part in the rotation.
--
-- Until this is applied nothing visible changes: the SDK still hides a distorted copy by itself, the server just does not
-- know about it and keeps serving creatives to the placement.

alter table public.placement_places
    add column if not exists shape_level smallint not null default 0 check (shape_level between 0 and 2),
    add column if not exists shape_worst real check (shape_worst is null or shape_worst >= 1);

alter table public.placements
    add column if not exists shape_blocked boolean not null default false;

insert into public.schema_versions (version, name)
values ('0051', '0051_placement_shape')
on conflict (version) do nothing;
