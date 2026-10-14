-- DeusADS 0029 — the header picture of a game's card on My games
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0019 (and everything before it).
--
--   games.cover: what fills the strip at the top of the game's card. null means the default
--   colour; "preset:<id>" is one of the colours offered in the pop-up; "image:<path>" is a picture
--   the owner uploaded into their own folder of the `creatives` storage bucket. The owner sets it
--   through the same row-level security as the rest of the game's columns.
--
-- Until this is applied nothing breaks: every card shows its default colour and the pop-up for
-- changing the header says the database needs the update.

alter table public.games
    add column if not exists cover text check (cover is null or char_length(cover) <= 300);

insert into public.schema_versions (version, name)
values ('0029', '0029_game_cover')
on conflict (version) do nothing;
