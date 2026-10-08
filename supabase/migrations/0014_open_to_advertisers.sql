-- DeusADS 0014 — developers choose which placements advertisers can book
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- Until now every placement a game reported went straight into the advertiser
-- catalog. From now on a placement is listed only while its developer has it
-- switched on ("Open to advertisers" on the game page).
--   * placements that exist when this runs stay open, so nothing disappears;
--   * placements reported later start closed, until the developer opens them.

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'placements' and column_name = 'open_to_advertisers'
    ) then
        alter table public.placements add column open_to_advertisers boolean not null default false;
        update public.placements set open_to_advertisers = true;
    end if;
end $$;

insert into public.schema_versions (version, name)
values ('0014', '0014_open_to_advertisers')
on conflict (version) do nothing;
