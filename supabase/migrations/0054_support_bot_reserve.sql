-- 0054: the assistant's daily limits, counted atomically.
-- support_bot_begin() checks the person's messages today and the assistant's tokens today and, if both are within the
-- limits, writes the log row for this question in the same step. Two questions sent at the same moment can no longer
-- both slip under the limit, and the day's token total is one SUM in the database instead of rows read by the server.
-- The server then fills the row in with what the assistant did. Only the service role may call it.

create or replace function public.support_bot_begin(p_owner uuid, p_question text, p_per_day integer, p_token_cap bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    used_today integer;
    tokens_today bigint;
    new_id uuid;
begin
    -- One question at a time per person.
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));

    select count(*) into used_today from public.support_bot_log where owner_id = p_owner and created_at >= day_start;
    if used_today >= p_per_day then
        return jsonb_build_object('status', 'limit');
    end if;

    select coalesce(sum(tokens_in + tokens_out), 0) into tokens_today from public.support_bot_log where created_at >= day_start;
    if tokens_today >= p_token_cap then
        return jsonb_build_object('status', 'budget');
    end if;

    insert into public.support_bot_log (owner_id, question, outcome, reason)
    values (p_owner, left(p_question, 1000), 'escalated', 'Assistant unavailable')
    returning id into new_id;
    return jsonb_build_object('status', 'ok', 'id', new_id);
end;
$$;

revoke all on function public.support_bot_begin(uuid, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.support_bot_begin(uuid, text, integer, bigint) to service_role;

insert into public.schema_versions (version, name)
values ('0054', '0054_support_bot_reserve')
on conflict (version) do nothing;
