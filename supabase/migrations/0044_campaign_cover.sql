-- DeusADS 0044 — the picture behind a campaign's page and its card
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0009 (campaigns) and everything before it.
--
--   campaigns.cover: what fills the strip at the top of the campaign's page and of its card in Settings, set
--   as a game's card header is (0029). null means "the picture of the campaign's first creative", or the
--   default colour while it has none; "preset:<id>" is one of the colours; "image:<path>" is a picture the
--   advertiser uploaded into their own folder of the `creatives` storage bucket. Written by the dashboard's
--   server code only, after it checked that the campaign is the caller's.
--
-- Until this is applied nothing breaks: every campaign shows the picture of its first creative or its default
-- colour, and the Settings card has no header controls.

alter table public.campaigns
    add column if not exists cover text check (cover is null or char_length(cover) <= 300);

insert into public.schema_versions (version, name)
values ('0044', '0044_campaign_cover')
on conflict (version) do nothing;
