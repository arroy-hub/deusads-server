-- DeusADS 0067 - a report keeps the picture it is about
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0063 (a report is about one picture).
--
-- A report is about a picture as it looked when it was sent. The advertiser may replace that picture afterwards
-- (that is what "change requested" asks for), and until now the dispute then showed whatever the creative had at the
-- moment: the admin compared the new picture with the wrong one. Now a copy of the reported picture is kept with the
-- report (in the storage, under reported/), and this column says where.
--
--   creative_disputes.reported_path   the copy of the reported picture; null for reports from before this file whose
--                                     picture was already replaced.
--
-- The code that ran before this file keeps working with it applied.

alter table public.creative_disputes add column if not exists reported_path text;

insert into public.schema_versions (version, name)
values ('0067', '0067_reported_picture')
on conflict (version) do nothing;
