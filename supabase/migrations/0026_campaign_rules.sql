-- DeusADS 0026 — rules that belong to a campaign: its audience, a pause, a draft's plan, games it skips
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again. Needs 0009 (campaigns).
--
--   campaigns.targeting   who the campaign is shown to (genres, platforms, languages, genres to skip); empty = every game.
--                         Works together with the audience of each creative: a game has to fit both.
--   campaigns.paused_at   set while the advertiser has paused the whole campaign; the manifest then serves none of it.
--   campaigns.plan        a draft's choices (creative, how placements were chosen, filters), so a campaign saved
--                         before it was started can be continued or copied.
--   campaign_excluded_games   games a campaign must not run in, chosen by the advertiser (undoable at any time).
--
-- Until this is applied nothing breaks: campaigns keep working with the audience of their creatives only, and
-- pause, skipping a game and drafts say they need the migration.

alter table public.campaigns
    add column if not exists targeting jsonb,
    add column if not exists paused_at timestamptz,
    add column if not exists plan      jsonb;

create table if not exists public.campaign_excluded_games (
    campaign_id uuid not null references public.campaigns (id) on delete cascade,
    game_id     uuid not null references public.games (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (campaign_id, game_id)
);
create index if not exists campaign_excluded_games_game_idx on public.campaign_excluded_games (game_id);

alter table public.campaign_excluded_games enable row level security;
drop policy if exists campaign_excluded_games_owner_read on public.campaign_excluded_games;
create policy campaign_excluded_games_owner_read on public.campaign_excluded_games
    for select to authenticated
    using (exists (
        select 1 from public.campaigns c
        where c.id = campaign_id and c.advertiser_id = (select auth.uid())
    ));
revoke all on public.campaign_excluded_games from public, anon, authenticated;
grant select on public.campaign_excluded_games to authenticated;

insert into public.schema_versions (version, name)
values ('0026', '0026_campaign_rules')
on conflict (version) do nothing;
