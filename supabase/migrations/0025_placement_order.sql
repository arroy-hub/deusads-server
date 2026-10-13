-- DeusADS 0025 — the developer's own order of placements inside a folder
--
-- Run once in the Supabase SQL editor. Safe to run again. Needs 0021.
--
-- Dragging a placement between two others in the Placements tab saves its place here.
-- placements.sort_index: 0, 1, 2 ... within the folder (or among the loose placements).
-- Empty for a placement nobody has put in order: those come after the ordered ones, by name.
--
-- Until this is applied nothing breaks: the tab sorts by name, and dragging a card into a folder
-- still works. Only putting a card between two others needs it.

alter table public.placements
    add column if not exists sort_index integer;

insert into public.schema_versions (version, name)
values ('0025', '0025_placement_order')
on conflict (version) do nothing;
