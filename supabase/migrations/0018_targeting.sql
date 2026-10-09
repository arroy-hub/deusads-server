-- DeusADS 0018 — targeting: a game describes itself, a creative can ask for a kind of game
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0017 (and everything before it).
--
--   1. games.genres / platforms / languages: what the developer says about the game while
--      registering it (lists of ids; the allowed ids live in lib/targeting.js, not here, so the
--      lists can grow without a migration). An empty list means "not filled in".
--   2. creatives.targeting: an advertiser's optional audience for a creative, for example
--      {"genres":["shooter"],"platforms":["quest"],"languages":["en","ru"],"exclude_genres":["horror"]}
--      null means every game. Users have no write grant on this column: it is written only by
--      server actions with the service role, which validate it with lib/targeting.js.
--
-- How the manifest uses it (code, not SQL): inside a field "any of", between fields "all",
-- exclude_genres "none of". A field the creative restricts but the game has not filled in does not
-- fit (strict). Creatives that do not fit are dropped before the rotation, so the placement shows
-- another advertiser or the developer's own creative. A booking is accepted either way.
--
-- Until this is applied nothing visible changes: code that needs the columns falls back to the
-- previous behaviour (no targeting, every creative can show).

alter table public.games
    add column if not exists genres    text[] not null default '{}' check (cardinality(genres) <= 32),
    add column if not exists platforms text[] not null default '{}' check (cardinality(platforms) <= 32),
    add column if not exists languages text[] not null default '{}' check (cardinality(languages) <= 64);

alter table public.creatives
    add column if not exists targeting jsonb check (targeting is null or jsonb_typeof(targeting) = 'object');

insert into public.schema_versions (version, name)
values ('0018', '0018_targeting')
on conflict (version) do nothing;
