-- DeusADS 0062 - the Campaigns tab of a game lists every picture a campaign shows there, and each can be blocked on its own
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0061 (wallet), 0023 (controls per game) and 0017 (ad formats).
--
-- A creative shows a different picture on placements of different shapes: its own picture for 16:9, another for 1:1,
-- its main picture cropped for a custom shape. Until now a developer saw one row per creative and could only block the
-- whole creative. Now a row is one picture: a creative in one shape, on the placements of that shape.
--
--   game_picture_blocks    a creative blocked in one shape in one game. `shape` is the key the code gives a placement's
--                          shape (lib/game-pictures.js): a format id such as r16x9, x2.33 for a custom shape, any when
--                          the game did not report one. The other shapes of the creative keep running. Blocks of a whole
--                          creative made before this (game_ad_controls, scope creative) stay as they are.
--   game_ad_control_log    also records changes of scope "picture" (target: creative id, a colon, the shape).
--   game_picture_stats()   views and visible time per placement, creative and day: the figures of a row.
--   wallet_game_pictures() paid impressions per day, campaign, creative and placement: what a row earned.
--
-- Nothing that exists changes meaning, so the code that ran before this file keeps working with it applied.
-- Until this is applied the Campaigns tab lists creatives as before and nothing can be blocked by shape.

-- ------------------------------------------------------------ 1. a creative blocked in one shape
create table if not exists public.game_picture_blocks (
    game_id      uuid not null references public.games (id) on delete cascade,
    developer_id uuid not null references public.accounts (id) on delete cascade,
    creative_id  uuid not null references public.creatives (id) on delete cascade,
    shape        text not null check (char_length(shape) between 1 and 24),
    reason       text check (char_length(reason) <= 300),
    comment      text check (char_length(comment) <= 500),
    changed_at   timestamptz not null default now(),
    primary key (game_id, creative_id, shape)
);
create index if not exists game_picture_blocks_creative_idx on public.game_picture_blocks (creative_id);
create index if not exists game_picture_blocks_developer_idx on public.game_picture_blocks (developer_id);

alter table public.game_picture_blocks enable row level security;
do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_picture_blocks' and policyname = 'game_picture_blocks_owner_read') then
        create policy game_picture_blocks_owner_read on public.game_picture_blocks
            for select to authenticated using (developer_id = (select auth.uid()));
    end if;
end $$;

-- Written only by the dashboard (service role), which checks who is calling and the limits.
revoke all on public.game_picture_blocks from public, anon, authenticated;
grant select on public.game_picture_blocks to authenticated;
grant all on public.game_picture_blocks to service_role;

-- ------------------------------------------------------------ 2. the log takes the new scope
alter table public.game_ad_control_log drop constraint if exists game_ad_control_log_scope_check;
alter table public.game_ad_control_log add constraint game_ad_control_log_scope_check
    check (scope in ('campaign', 'creative', 'advertiser', 'category', 'picture'));

-- ------------------------------------------------------------ 3. figures per placement and creative
-- Views of advertisers' creatives in one game per placement, creative and day, with visible time as a sum and a count:
-- [{ placement_id, creative_id, day, views, visible_sum, visible_n }]. The same rows game_campaign_stats() counts,
-- one step finer. One JSON value, so a busy game is never cut at the row limit of the API.
create or replace function public.game_picture_stats(p_game_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
               'placement_id', s.placement_id, 'creative_id', s.creative_id, 'day', s.day,
               'views', s.views, 'visible_sum', s.visible_sum, 'visible_n', s.visible_n)), '[]'::jsonb)
    from (
        select i.placement_id,
               i.creative_id,
               (i.occurred_at at time zone 'utc')::date as day,
               count(*)::bigint                          as views,
               coalesce(sum(i.visible_seconds), 0)       as visible_sum,
               count(i.visible_seconds)::bigint          as visible_n
        from public.impressions i
        where i.game_id = p_game_id
          and not coalesce(i.own, false)
          and i.creative_id is not null
          and i.occurred_at >= (greatest(p_from, p_to - 365)::timestamp at time zone 'utc')
          and i.occurred_at <  ((p_to + 1)::timestamp at time zone 'utc')
        group by i.placement_id, i.creative_id, (i.occurred_at at time zone 'utc')::date
    ) s;
$$;

revoke execute on function public.game_picture_stats(uuid, date, date) from public, anon;
grant execute on function public.game_picture_stats(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ 4. what was paid per placement and creative
-- Paid impressions of one game per day, campaign, creative and placement:
-- [{ day, campaign_id, creative_id, placement_id, impressions }].
create or replace function public.wallet_game_pictures(p_game uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'campaign_id', campaign_id, 'creative_id', creative_id,
                                                 'placement_id', placement_id, 'impressions', impressions)), '[]'::jsonb)
    from (select day, campaign_id, creative_id, placement_id, sum(impressions) as impressions
          from public.wallet_earnings where game_id = p_game and day between p_from and p_to group by 1, 2, 3, 4) s;
$$;

revoke execute on function public.wallet_game_pictures(uuid, date, date) from public, anon, authenticated;
grant execute on function public.wallet_game_pictures(uuid, date, date) to service_role;

insert into public.schema_versions (version, name)
values ('0062', '0062_picture_rows')
on conflict (version) do nothing;
