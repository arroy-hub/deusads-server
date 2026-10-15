-- DeusADS 0031 — more about a game: description, store link, devices, play modes
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0018 (and everything before it).
--
--   games.description: one line about the game (up to 140 characters). The app no longer shows or edits it;
--   the column stays because the migration was already applied.
--   games.store_url:   where the game is sold (Meta, Steam, Pico ...), kept for later automatic checks.
--   games.devices / play_modes: lists of ids (the allowed ids live in lib/game-about.js, not here, so the
--   lists can grow without a migration). Empty means "not filled in". None of these is used to aim an ad.
--
-- Until this is applied nothing breaks: games are created and saved without these fields, and cards and
-- settings simply do not show them.

alter table public.games
    add column if not exists description text check (description is null or char_length(description) <= 140),
    add column if not exists store_url   text check (store_url is null or char_length(store_url) <= 300),
    add column if not exists devices     text[] not null default '{}' check (cardinality(devices) <= 32),
    add column if not exists play_modes  text[] not null default '{}' check (cardinality(play_modes) <= 16);

insert into public.schema_versions (version, name)
values ('0031', '0031_game_about')
on conflict (version) do nothing;
