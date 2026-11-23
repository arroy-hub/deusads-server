-- DeusADS 0061 - virtual wallet: credits for impressions, campaign budgets, earnings of games
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0026 (campaign rules), 0021 (places) and 0020 (own creatives).
--
-- Credits are demo units for the pilot: no real money moves. One price for everybody, set by the platform:
-- 6 credits per 1,000 impressions (0.006 a view). The developer of the game gets 80% of it, DeusADS keeps 20%.
-- The share is not stored: every amount here is what the advertiser paid, and the code works out the shares.
--
--   campaigns.budget          the most a campaign may spend in total; null = no limit (every campaign that existed before
--                             this migration, so nothing that runs today stops)
--   campaigns.budget_spent    what its counted impressions have cost so far (also kept for campaigns with no limit)
--   campaigns.budget_closed_at / budget_returned   the campaign is over and what was left went back to the wallet
--   campaigns.budget_out_at / budget_low_at        when it ran out, and when 90% was used (for the notices)
--   wallet_ops                an advertiser's wallet: credits added, reserved for a campaign, returned from one
--   wallet_earnings           what was paid, per day, placement, place, creative and campaign
--
-- An impression is paid when it is an advertiser's creative (not the developer's own), it was booked by a campaign and
-- that campaign still has budget. It is charged in the same statement that stores it (a trigger on impressions), so a
-- batch that is sent again, which the unique event id ignores, is never charged twice. Whatever goes wrong while charging
-- is only logged: a view is never lost because of the wallet.
--
-- History: the impressions that are already stored are charged the same way once, when this file is first applied, so a
-- developer sees what the games have earned so far. Campaigns that existed have no limit, so nothing is taken from anybody.
--
-- Until this is applied the code shows no wallet figures and the Wallet pages say what to run; everything else works.

alter table public.campaigns add column if not exists budget           numeric(14, 2);
alter table public.campaigns add column if not exists budget_spent     numeric(16, 4) not null default 0;
alter table public.campaigns add column if not exists budget_closed_at timestamptz;
alter table public.campaigns add column if not exists budget_returned  numeric(16, 4) not null default 0;
alter table public.campaigns add column if not exists budget_out_at    timestamptz;
alter table public.campaigns add column if not exists budget_low_at    timestamptz;
alter table public.campaigns add column if not exists budget_out_told  boolean not null default false;
alter table public.campaigns add column if not exists budget_low_told  boolean not null default false;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'campaigns_budget_positive') then
        alter table public.campaigns add constraint campaigns_budget_positive check (budget is null or budget > 0);
    end if;
end $$;

create table if not exists public.wallet_ops (
    id            bigint generated always as identity primary key,
    account_id    uuid           not null references public.accounts (id) on delete cascade,
    kind          text           not null check (kind in ('topup', 'reserve', 'return')),
    campaign_id   uuid,
    campaign_name text,
    amount        numeric(16, 4) not null,
    created_at    timestamptz    not null default now()
);
create index if not exists wallet_ops_account_idx on public.wallet_ops (account_id, created_at desc);

-- place_id: the all-zero id stands for "no place recorded", so the row has one key whatever the SDK sent.
create table if not exists public.wallet_earnings (
    day           date           not null,
    game_id       uuid           not null,
    developer_id  uuid           not null,
    placement_id  uuid           not null,
    place_id      uuid           not null default '00000000-0000-0000-0000-000000000000',
    creative_id   uuid           not null,
    campaign_id   uuid           not null,
    advertiser_id uuid           not null,
    impressions   bigint         not null default 0,
    amount        numeric(16, 4) not null default 0,
    primary key (day, placement_id, place_id, creative_id, campaign_id)
);
create index if not exists wallet_earnings_developer_idx  on public.wallet_earnings (developer_id, day);
create index if not exists wallet_earnings_advertiser_idx on public.wallet_earnings (advertiser_id, day);
create index if not exists wallet_earnings_game_idx       on public.wallet_earnings (game_id, day);
create index if not exists wallet_earnings_campaign_idx   on public.wallet_earnings (campaign_id, day);

-- Only the server reads and writes these (with the service role), always scoped to the signed-in account.
alter table public.wallet_ops enable row level security;
alter table public.wallet_earnings enable row level security;
revoke all on public.wallet_ops from public, anon, authenticated;
revoke all on public.wallet_earnings from public, anon, authenticated;
grant all on public.wallet_ops to service_role;
grant all on public.wallet_earnings to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- The price of one impression, in credits.
create or replace function public.wallet_price()
returns numeric
language sql
immutable
set search_path = public
as $$ select 0.006::numeric $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Charges the impressions a statement has just stored.
create or replace function public.wallet_charge_impressions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_price constant numeric := public.wallet_price();
    r       record;
    c       record;
    v_pay   bigint;
    v_spent numeric;
begin
    for r in
        select b.campaign_id,
               b.advertiser_id,
               n.game_id,
               n.owner_id                                                              as developer_id,
               n.placement_id,
               coalesce(n.place_id, '00000000-0000-0000-0000-000000000000'::uuid)       as place_id,
               n.creative_id,
               (n.occurred_at at time zone 'utc')::date                                 as day,
               count(*)::bigint                                                         as views
        from new_rows n
        join lateral (
            -- the booking that showed it: the live one if there is one (at most one per placement and creative)
            select bk.campaign_id, bk.advertiser_id
            from public.bookings bk
            where bk.placement_id = n.placement_id and bk.creative_id = n.creative_id
            order by (bk.status in ('approved', 'pending')) desc, bk.created_at desc
            limit 1
        ) b on true
        where not coalesce(n.own, false)
          and n.creative_id is not null
          and n.placement_id is not null
        group by 1, 2, 3, 4, 5, 6, 7, 8
        order by 1, 8, 5, 6, 7 -- campaigns always in the same order, so two batches never wait for each other
    loop
        select budget, budget_spent, budget_closed_at into c from public.campaigns where id = r.campaign_id for update;
        if not found then
            continue;
        end if;

        if c.budget is null then
            v_pay := r.views;
        elsif c.budget_closed_at is not null then
            v_pay := 0;
        else
            v_pay := least(r.views, greatest(0, floor((c.budget - c.budget_spent) / v_price)::bigint));
        end if;
        v_spent := c.budget_spent + v_pay * v_price;

        if v_pay > 0 or (c.budget is not null and c.budget_closed_at is null) then
            update public.campaigns
            set budget_spent  = v_spent,
                budget_out_at = case when budget is not null and budget_closed_at is null and budget - v_spent < v_price
                                     then coalesce(budget_out_at, now()) else budget_out_at end,
                budget_low_at = case when budget is not null and budget_closed_at is null and v_spent >= budget * 0.9
                                     then coalesce(budget_low_at, now()) else budget_low_at end
            where id = r.campaign_id;
        end if;

        if v_pay > 0 then
            insert into public.wallet_earnings as e
                (day, game_id, developer_id, placement_id, place_id, creative_id, campaign_id, advertiser_id, impressions, amount)
            values
                (r.day, r.game_id, r.developer_id, r.placement_id, r.place_id, r.creative_id, r.campaign_id, r.advertiser_id, v_pay, v_pay * v_price)
            on conflict (day, placement_id, place_id, creative_id, campaign_id)
            do update set impressions = e.impressions + excluded.impressions, amount = e.amount + excluded.amount;
        end if;
    end loop;
    return null;
exception when others then
    raise warning 'wallet_charge_impressions: % (%)', sqlerrm, sqlstate;
    return null;
end;
$$;

revoke execute on function public.wallet_charge_impressions() from public, anon, authenticated;

-- The trigger and, the first time only, the history. Nothing can be stored in between: the table is locked for the moment.
do $$
begin
    lock table public.impressions in share row exclusive mode;

    if not exists (select 1 from public.schema_versions where version = '0061') and not exists (select 1 from public.wallet_earnings) then
        insert into public.wallet_earnings
            (day, game_id, developer_id, placement_id, place_id, creative_id, campaign_id, advertiser_id, impressions, amount)
        select (i.occurred_at at time zone 'utc')::date,
               i.game_id,
               i.owner_id,
               i.placement_id,
               coalesce(i.place_id, '00000000-0000-0000-0000-000000000000'::uuid),
               i.creative_id,
               b.campaign_id,
               b.advertiser_id,
               count(*)::bigint,
               count(*) * public.wallet_price()
        from public.impressions i
        join lateral (
            select bk.campaign_id, bk.advertiser_id
            from public.bookings bk
            where bk.placement_id = i.placement_id and bk.creative_id = i.creative_id
            order by (bk.status in ('approved', 'pending')) desc, bk.created_at desc
            limit 1
        ) b on true
        where not coalesce(i.own, false)
          and i.creative_id is not null
          and i.placement_id is not null
        group by 1, 2, 3, 4, 5, 6, 7, 8;

        update public.campaigns c
        set budget_spent = s.amount
        from (select campaign_id, sum(amount) as amount from public.wallet_earnings group by campaign_id) s
        where c.id = s.campaign_id;
    end if;

    drop trigger if exists wallet_charge on public.impressions;
    create trigger wallet_charge
        after insert on public.impressions
        referencing new table as new_rows
        for each statement
        execute function public.wallet_charge_impressions();
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- An advertiser's wallet. Every change takes a lock on the account first, so two requests cannot both spend the same credits.

create or replace function public.wallet_available(p_account uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$ select coalesce(sum(amount), 0) from public.wallet_ops where account_id = p_account $$;

-- Adds credits. Returns { ok, available } or { error }.
create or replace function public.wallet_topup(p_account uuid, p_amount numeric)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_amount numeric := round(p_amount, 2);
begin
    if v_amount is null or v_amount <= 0 then
        return jsonb_build_object('error', 'amount');
    end if;
    if v_amount > 1000000 then
        return jsonb_build_object('error', 'too_much');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_account::text, 61));
    insert into public.wallet_ops (account_id, kind, amount) values (p_account, 'topup', v_amount);
    return jsonb_build_object('ok', true, 'available', public.wallet_available(p_account));
end;
$$;

-- Moves credits from the wallet into a campaign's budget: its first budget, or more of it. A campaign that had run out, or
-- whose remainder was already returned, can show again. Returns { ok, available, budget, resumed } or { error, available }.
create or replace function public.wallet_reserve(p_account uuid, p_campaign uuid, p_amount numeric)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_amount    numeric := round(p_amount, 2);
    v_available numeric;
    c           record;
    v_budget    numeric;
    v_resumed   boolean;
begin
    if v_amount is null or v_amount <= 0 then
        return jsonb_build_object('error', 'amount');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_account::text, 61));
    select id, name, budget, budget_spent, budget_closed_at, budget_returned into c
    from public.campaigns where id = p_campaign and advertiser_id = p_account for update;
    if not found then
        return jsonb_build_object('error', 'campaign');
    end if;
    -- A campaign that has always run without a limit keeps doing so: a budget would be used up by its past at once.
    if c.budget is null and c.budget_spent > 0 then
        return jsonb_build_object('error', 'no_limit');
    end if;
    v_available := public.wallet_available(p_account);
    if v_available < v_amount then
        return jsonb_build_object('error', 'funds', 'available', v_available);
    end if;

    v_resumed := c.budget is not null and (c.budget_closed_at is not null or c.budget - c.budget_spent < public.wallet_price());
    -- After its remainder went back, the campaign starts again from what it kept.
    v_budget := case when c.budget is null then v_amount
                     when c.budget_closed_at is not null then c.budget - c.budget_returned + v_amount
                     else c.budget + v_amount end;

    insert into public.wallet_ops (account_id, kind, campaign_id, campaign_name, amount)
    values (p_account, 'reserve', c.id, c.name, -v_amount);
    update public.campaigns
    set budget = v_budget, budget_closed_at = null, budget_returned = 0,
        budget_out_at = null, budget_low_at = null, budget_out_told = false, budget_low_told = false
    where id = c.id;
    -- still nearly used up after a small top-up: say so again later
    update public.campaigns
    set budget_low_at = now(), budget_low_told = true
    where id = c.id and budget_spent >= budget * 0.9;

    return jsonb_build_object('ok', true, 'available', v_available - v_amount, 'budget', v_budget, 'resumed', v_resumed);
end;
$$;

-- The campaign is over (stopped, ended or about to be deleted): what is left of its budget goes back to the wallet.
-- Does it once. Returns { ok, returned } (0 when there was nothing to return or it was done before).
create or replace function public.wallet_close(p_account uuid, p_campaign uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    c      record;
    v_back numeric;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_account::text, 61));
    select id, name, budget, budget_spent, budget_closed_at into c
    from public.campaigns where id = p_campaign and advertiser_id = p_account for update;
    if not found then
        return jsonb_build_object('error', 'campaign');
    end if;
    if c.budget is null or c.budget_closed_at is not null then
        return jsonb_build_object('ok', true, 'returned', 0);
    end if;
    -- whole cents go back; what is under a cent stays with the campaign
    v_back := greatest(0, trunc(c.budget - c.budget_spent, 2));
    if v_back > 0 then
        insert into public.wallet_ops (account_id, kind, campaign_id, campaign_name, amount)
        values (p_account, 'return', c.id, c.name, v_back);
    end if;
    update public.campaigns
    set budget_closed_at = now(), budget_returned = v_back, budget_out_at = null, budget_low_at = null
    where id = c.id;
    return jsonb_build_object('ok', true, 'returned', v_back);
end;
$$;

-- The notices that are due: campaigns that ran out of budget or used 90% of it and whose advertiser has not been told.
-- Each is handed out once.
create or replace function public.wallet_take_notices()
returns table (campaign_id uuid, advertiser_id uuid, name text, kind text, budget numeric, spent numeric)
language plpgsql
security invoker
set search_path = public
as $$
begin
    return query
        update public.campaigns c
        set budget_out_told = true, budget_low_told = true
        where c.budget is not null and c.budget_closed_at is null and c.budget_out_at is not null and not c.budget_out_told
        returning c.id, c.advertiser_id, c.name, 'out'::text, c.budget, c.budget_spent;
    return query
        update public.campaigns c
        set budget_low_told = true
        where c.budget is not null and c.budget_closed_at is null and c.budget_low_at is not null and not c.budget_low_told
          and c.budget_out_at is null
        returning c.id, c.advertiser_id, c.name, 'low'::text, c.budget, c.budget_spent;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Reading. Each answer is one JSON value: a list of rows would be cut at the API's row limit.

-- An advertiser's figures: what is in the wallet, what the campaigns spent in all and today (UTC).
create or replace function public.wallet_advertiser(p_account uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select jsonb_build_object(
        'available', public.wallet_available(p_account),
        'spent', coalesce((select sum(amount) from public.wallet_earnings where advertiser_id = p_account), 0),
        'impressions', coalesce((select sum(impressions) from public.wallet_earnings where advertiser_id = p_account), 0),
        'spent_today', coalesce((select sum(amount) from public.wallet_earnings where advertiser_id = p_account and day = (now() at time zone 'utc')::date), 0),
        'impressions_today', coalesce((select sum(impressions) from public.wallet_earnings where advertiser_id = p_account and day = (now() at time zone 'utc')::date), 0)
    );
$$;

-- What an advertiser's campaigns spent per day: [{ day, campaign_id, impressions, amount }]. p_campaign null = all of them.
create or replace function public.wallet_spend_daily(p_account uuid, p_from date, p_to date, p_campaign uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'campaign_id', campaign_id, 'impressions', impressions, 'amount', amount) order by day, campaign_id), '[]'::jsonb)
    from (
        select day, campaign_id, sum(impressions) as impressions, sum(amount) as amount
        from public.wallet_earnings
        where advertiser_id = p_account and day between p_from and p_to and (p_campaign is null or campaign_id = p_campaign)
        group by day, campaign_id
    ) s;
$$;

-- A developer's earnings (amounts are what advertisers paid; the developer's share is worked out by the code):
--   total, today             all time and today (UTC): { impressions, amount }
--   daily                    [{ day, game_id, impressions, amount }] between p_from and p_to
--   campaigns                [{ campaign_id, advertiser_id, game_id, impressions, amount }] between p_from and p_to,
--                            one row for each game a campaign was paid in
create or replace function public.wallet_developer(p_account uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select jsonb_build_object(
        'total', (select jsonb_build_object('impressions', coalesce(sum(impressions), 0), 'amount', coalesce(sum(amount), 0))
                  from public.wallet_earnings where developer_id = p_account),
        'today', (select jsonb_build_object('impressions', coalesce(sum(impressions), 0), 'amount', coalesce(sum(amount), 0))
                  from public.wallet_earnings where developer_id = p_account and day = (now() at time zone 'utc')::date),
        'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'game_id', game_id, 'impressions', impressions, 'amount', amount) order by day, game_id), '[]'::jsonb)
                  from (select day, game_id, sum(impressions) as impressions, sum(amount) as amount
                        from public.wallet_earnings where developer_id = p_account and day between p_from and p_to group by day, game_id) d),
        'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('campaign_id', campaign_id, 'advertiser_id', advertiser_id, 'game_id', game_id, 'impressions', impressions, 'amount', amount) order by amount desc), '[]'::jsonb)
                      from (select campaign_id, min(advertiser_id::text)::uuid as advertiser_id, game_id, sum(impressions) as impressions, sum(amount) as amount
                            from public.wallet_earnings where developer_id = p_account and day between p_from and p_to group by campaign_id, game_id) k)
    );
$$;

-- Paid impressions of one game between two days:
--   places     [{ day, placement_id, place_id (null when none was recorded), impressions }]
--   campaigns  [{ campaign_id, advertiser_id, placement_id, place_id, impressions }]
create or replace function public.wallet_game(p_game uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select jsonb_build_object(
        'places', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'placement_id', placement_id, 'place_id', place_id, 'impressions', impressions)), '[]'::jsonb)
                   from (select day, placement_id, nullif(place_id, '00000000-0000-0000-0000-000000000000'::uuid) as place_id, sum(impressions) as impressions
                         from public.wallet_earnings where game_id = p_game and day between p_from and p_to group by 1, 2, 3) p),
        'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('campaign_id', campaign_id, 'advertiser_id', advertiser_id, 'placement_id', placement_id, 'place_id', place_id, 'impressions', impressions)), '[]'::jsonb)
                      from (select campaign_id, min(advertiser_id::text)::uuid as advertiser_id, placement_id, nullif(place_id, '00000000-0000-0000-0000-000000000000'::uuid) as place_id, sum(impressions) as impressions
                            from public.wallet_earnings where game_id = p_game and day between p_from and p_to group by 1, 3, 4) k)
    );
$$;

-- Paid impressions of one game per day, campaign and creative: [{ day, campaign_id, creative_id, impressions }].
create or replace function public.wallet_game_creatives(p_game uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'campaign_id', campaign_id, 'creative_id', creative_id, 'impressions', impressions)), '[]'::jsonb)
    from (select day, campaign_id, creative_id, sum(impressions) as impressions
          from public.wallet_earnings where game_id = p_game and day between p_from and p_to group by 1, 2, 3) s;
$$;

-- The platform's books: everything advertisers paid.
--   total, today   { impressions, amount }
--   daily          [{ day, impressions, amount }] between p_from and p_to
--   campaigns      [{ campaign_id, advertiser_id, impressions, amount }] all time
--   games          [{ game_id, developer_id, impressions, amount }] all time
--   added          credits advertisers added to their wallets
--   no_limit       paid by campaigns that run without a limit (nothing was taken from a wallet for it)
create or replace function public.wallet_platform(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select jsonb_build_object(
        'total', (select jsonb_build_object('impressions', coalesce(sum(impressions), 0), 'amount', coalesce(sum(amount), 0)) from public.wallet_earnings),
        'today', (select jsonb_build_object('impressions', coalesce(sum(impressions), 0), 'amount', coalesce(sum(amount), 0))
                  from public.wallet_earnings where day = (now() at time zone 'utc')::date),
        'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'impressions', impressions, 'amount', amount) order by day), '[]'::jsonb)
                  from (select day, sum(impressions) as impressions, sum(amount) as amount from public.wallet_earnings where day between p_from and p_to group by day) d),
        'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('campaign_id', campaign_id, 'advertiser_id', advertiser_id, 'impressions', impressions, 'amount', amount) order by amount desc), '[]'::jsonb)
                      from (select campaign_id, min(advertiser_id::text)::uuid as advertiser_id, sum(impressions) as impressions, sum(amount) as amount from public.wallet_earnings group by campaign_id) k),
        'games', (select coalesce(jsonb_agg(jsonb_build_object('game_id', game_id, 'developer_id', developer_id, 'impressions', impressions, 'amount', amount) order by amount desc), '[]'::jsonb)
                  from (select game_id, min(developer_id::text)::uuid as developer_id, sum(impressions) as impressions, sum(amount) as amount from public.wallet_earnings group by game_id) g),
        'added', coalesce((select sum(amount) from public.wallet_ops where kind = 'topup'), 0),
        'no_limit', coalesce((select sum(e.amount) from public.wallet_earnings e join public.campaigns c on c.id = e.campaign_id where c.budget is null), 0)
            + coalesce((select sum(e.amount) from public.wallet_earnings e where not exists (select 1 from public.campaigns c where c.id = e.campaign_id)), 0)
    );
$$;

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.wallet_available(uuid)',
        'public.wallet_topup(uuid, numeric)',
        'public.wallet_reserve(uuid, uuid, numeric)',
        'public.wallet_close(uuid, uuid)',
        'public.wallet_take_notices()',
        'public.wallet_advertiser(uuid)',
        'public.wallet_spend_daily(uuid, date, date, uuid)',
        'public.wallet_developer(uuid, date, date)',
        'public.wallet_game(uuid, date, date)',
        'public.wallet_game_creatives(uuid, date, date)',
        'public.wallet_platform(date, date)'
    ] loop
        execute format('revoke execute on function %s from public, anon, authenticated', f);
        execute format('grant execute on function %s to service_role', f);
    end loop;
end $$;

insert into public.schema_versions (version, name)
values ('0061', '0061_wallet')
on conflict (version) do nothing;
