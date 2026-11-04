-- DeusADS 0058 - which campaigns a game's description fits, and since when
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- When a developer changes what a game is (genres, platforms, languages, countries), or an advertiser changes an audience,
-- a campaign can stop fitting a game: the manifest stops serving it there. The dashboards show it as 'Not shown - audience'
-- for an hour, then drop it from the developer's Campaigns list, and tell both people on Home (Recent activity) and under
-- the bell, in both directions (stopped fitting / fits again).
--
--   campaign_fit   one row per campaign and game it is booked in: whether it fits now, why not, and since when.
--                  Written by the server only; nobody reads it from the browser.
--
-- Until this is applied the dashboards still show 'Not shown - audience' (it is worked out on every read), but the hour
-- and the messages do not exist.

create table if not exists public.campaign_fit (
    game_id     uuid not null references public.games (id) on delete cascade,
    campaign_id uuid not null references public.campaigns (id) on delete cascade,
    fits        boolean not null,
    why         text check (char_length(why) <= 300),
    since       timestamptz not null default now(),
    primary key (game_id, campaign_id)
);
alter table public.campaign_fit enable row level security;
revoke all on public.campaign_fit from public, anon, authenticated;

insert into public.schema_versions (version, name)
values ('0058', '0058_campaign_fit')
on conflict (version) do nothing;
