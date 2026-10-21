-- DeusADS 0050 — country targeting: a game says which countries its players are in
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0018 (targeting) and everything before it.
--
--   games.countries: the countries the game's audience mainly lives in, chosen by the developer in the game's
--   card (lower-case ISO 3166-1 alpha-2 ids such as "us", "de"; the allowed ids live in lib/targeting.js, not
--   here, so the list can grow without a migration). An empty list means "not filled in", like the other lists.
--
--   The audience of a campaign or creative (campaigns.targeting, creatives.targeting: jsonb, 0018 / 0026) gets
--   two more optional keys, "countries" and "exclude_countries". No column changes are needed for that; the
--   keys are validated by lib/targeting.js when they are saved.
--
-- Until this is applied nothing visible changes except that the countries field is not asked for: code that
-- reads the column falls back to the previous behaviour, and a campaign cannot be aimed at countries.

alter table public.games
    add column if not exists countries text[] not null default '{}' check (cardinality(countries) <= 256);

insert into public.schema_versions (version, name)
values ('0050', '0050_game_countries')
on conflict (version) do nothing;
