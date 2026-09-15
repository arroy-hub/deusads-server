-- DeusADS 0002 — placement sync and per-view impressions
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- 1. Placements removed from a game are hidden, not deleted.
--    "Send placements" in the Unity editor now reports the complete list of a
--    game's placements. Any placement missing from that list gets removed_at;
--    sending it again clears the mark. Rows are kept so past impressions stay
--    attributed and a placement deleted by mistake comes back with its creative.
--
-- 2. Impressions are counted per view, not per session.
--    SDK 0.4 counts every time a banner is viewed (with a cooldown), so the old
--    unique index (one row per placement per session) silently dropped real views.
--    Each impression now carries an event_id; a retried batch repeats the same
--    event_id and is ignored, a new view has a new one.

-- ---------------------------------------------------------------- placements

alter table placements add column if not exists removed_at timestamptz;

create index if not exists placements_game_live_idx
    on placements (game_id)
    where removed_at is null;

-- ---------------------------------------------------------------- impressions

alter table impressions add column if not exists event_id text;

-- Existing rows were already unique per session; give each its own id.
update impressions set event_id = 'legacy-' || id::text where event_id is null;

alter table impressions alter column event_id set not null;

drop index if exists impressions_dedupe;

create unique index if not exists impressions_event_unique
    on impressions (game_id, event_id);
