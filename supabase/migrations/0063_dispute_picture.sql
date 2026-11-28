-- DeusADS 0063 - a report says which picture of a creative it is about
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0062 (rows per picture) and 0045 (disputes both ways).
--
-- Since 0062 a developer reports and blocks one picture: a creative in one shape. The report only kept the creative,
-- so the admin saw its main picture, not the one that was reported, and could not tell which placements it is about.
--
--   creative_disputes.shape   the key of the shape the report is about (lib/game-pictures.js: r16x9, x2.3, any), or
--                             null for a report about the whole creative (all reports made before this, and an
--                             advertiser's reports, which are about a booking).
--   one open report           per game, creative, side AND shape: another picture of the same creative can be
--                             reported while the first report is open.
--   reports already made      take the shape of the picture that was blocked together with the report ("Also block"):
--                             the log has that block within a minute of the report.
--
-- The code that ran before this file keeps working with it applied (it never writes the new column).

alter table public.creative_disputes
    add column if not exists shape text check (shape is null or char_length(shape) between 1 and 24);

create unique index if not exists creative_disputes_one_open_v3
    on public.creative_disputes (game_id, creative_id, initiator, (coalesce(shape, ''))) where status = 'open';
drop index if exists public.creative_disputes_one_open_v2;

-- Reports sent with "Also block" since 0062: the picture blocked for the review is the one that was reported. The log
-- keeps that block (target: creative id, a colon, the shape) even when the developer has unblocked it since.
update public.creative_disputes d
set shape = split_part(l.target_id, ':', 2)
from public.game_ad_control_log l
where d.shape is null
  and d.initiator = 'developer'
  and l.game_id = d.game_id
  and l.scope = 'picture'
  and l.action = 'block'
  and l.reason = 'Blocked pending a DeusADS review'
  and split_part(l.target_id, ':', 1) = d.creative_id::text
  and split_part(l.target_id, ':', 2) <> ''
  and l.created_at between d.created_at and d.created_at + interval '1 minute';

insert into public.schema_versions (version, name)
values ('0063', '0063_dispute_picture')
on conflict (version) do nothing;
