-- DeusADS 0048 — a campaign's own category
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0015 (ad_categories) and 0009 (campaigns).
--
--   campaigns.category: what the campaign is about, chosen by the advertiser when the campaign is created. It
--   sets the icon on the campaign card and in the lists. It is for display only: what a developer may block, and
--   which restricted categories need their opt-in, still follow each creative's own ad_category (0015), so a
--   campaign can hold creatives of several categories. null means "the category of the campaign's first
--   creative", as before.
--
-- Until this is applied nothing breaks: the wizard still asks for the category but it is not stored, and the
-- icon comes from the first creative as it did.

alter table public.campaigns
    add column if not exists category text references public.ad_categories (id) on update cascade;

insert into public.schema_versions (version, name)
values ('0048', '0048_campaign_category')
on conflict (version) do nothing;
