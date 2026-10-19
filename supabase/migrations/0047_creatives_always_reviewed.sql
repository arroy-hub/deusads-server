-- DeusADS 0047 — every new creative waits for review, whoever uploads it
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
--
-- Until now only a creative uploaded by an advertiser started as 'pending'; one uploaded by an admin or a
-- developer was approved at once, so a campaign built on it started immediately. Now every creative except a
-- developer's own picture on a placement (kind 'own', never reviewed) starts as 'pending' and reaches the SDK
-- only after an admin approves it in Review creatives. Creatives that already exist keep their status.

create or replace function private.creative_default_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.kind is distinct from 'own' then
        new.status := 'pending';
    end if;
    return new;
end;
$$;

insert into public.schema_versions (version, name)
values ('0047', '0047_creatives_always_reviewed')
on conflict (version) do nothing;
