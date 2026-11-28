-- DeusADS 0066 - every placement shape belongs to one format of one list
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0065 (picture holds) and 0062 (rows per picture).
--
-- The SDK offers placements of some shapes and the dashboard let advertisers make pictures for others: 21:9 was a
-- shape of the SDK the dashboard did not know, so a 21:9 placement was "a custom shape" (key x2.3) that an advertiser
-- could not see, and a picture for it could only be uploaded as "custom". Now there is one list on both sides
-- (16:9, 4:3, 1:1, 3:4, 9:16, 2:1, 21:9, 3:1), a placement of any other proportion belongs to the nearest of them,
-- and there are no custom pictures.
--
--   ad_formats                 gets the 21:9 row.
--   creative_assets            a custom picture (no format) that is within 15% of a format the creative has no
--                              picture for becomes that format's picture; the rest stay unused.
--   shapes kept as "x2.3"      in reports, picture blocks, picture holds and the log of blocks become the format
--                              they are nearest to ("r21x9").
--
-- The code that ran before this file keeps working with it applied.

-- 21:9 joins the list of formats a picture can be made for
insert into public.ad_formats (id, label, aspect, sort)
values ('r21x9', '21:9 ultrawide', 2.333, 65)
on conflict (id) do nothing;

create or replace function pg_temp.deus_format(p_aspect numeric) returns text language sql immutable as $$
    select f.id
    from (values ('r16x9', 16.0 / 9), ('r4x3', 4.0 / 3), ('r1x1', 1.0), ('r3x4', 0.75), ('r9x16', 9.0 / 16), ('r2x1', 2.0), ('r21x9', 21.0 / 9), ('r3x1', 3.0)) as f(id, aspect)
    where p_aspect > 0
    order by abs(ln(p_aspect / f.aspect)), f.id
    limit 1
$$;

-- custom pictures: the nearest format, when it is close and free (the newest picture wins when two would land on it)
with ranked as (
    select a.id, pg_temp.deus_format(a.aspect) as format,
           row_number() over (partition by a.creative_id, pg_temp.deus_format(a.aspect) order by a.created_at desc) as n
    from public.creative_assets a
    where a.format_id is null and a.aspect > 0
      and abs(a.aspect / (select f.aspect from (values ('r16x9', 16.0 / 9), ('r4x3', 4.0 / 3), ('r1x1', 1.0), ('r3x4', 0.75), ('r9x16', 9.0 / 16), ('r2x1', 2.0), ('r21x9', 21.0 / 9), ('r3x1', 3.0)) as f(id, aspect) where f.id = pg_temp.deus_format(a.aspect)) - 1) <= 0.15
)
update public.creative_assets a
set format_id = r.format
from ranked r
where a.id = r.id and r.n = 1
  and not exists (select 1 from public.creative_assets b where b.creative_id = a.creative_id and b.format_id = r.format);

-- shapes written as "x<aspect>": the format they are nearest to
update public.creative_disputes d
set shape = pg_temp.deus_format(substr(d.shape, 2)::numeric)
where d.shape ~ '^x[0-9]+(\.[0-9]+)?$'
  and not exists (select 1 from public.creative_disputes o where o.id <> d.id and o.status = 'open' and d.status = 'open' and o.game_id = d.game_id and o.creative_id = d.creative_id and o.initiator = d.initiator and o.shape = pg_temp.deus_format(substr(d.shape, 2)::numeric));

delete from public.game_picture_blocks b
where b.shape ~ '^x[0-9]+(\.[0-9]+)?$'
  and exists (select 1 from public.game_picture_blocks o where o.game_id = b.game_id and o.creative_id = b.creative_id and o.shape = pg_temp.deus_format(substr(b.shape, 2)::numeric));
update public.game_picture_blocks b
set shape = pg_temp.deus_format(substr(b.shape, 2)::numeric)
where b.shape ~ '^x[0-9]+(\.[0-9]+)?$';

delete from public.creative_picture_holds h
where h.shape ~ '^x[0-9]+(\.[0-9]+)?$'
  and exists (select 1 from public.creative_picture_holds o where o.creative_id = h.creative_id and o.shape = pg_temp.deus_format(substr(h.shape, 2)::numeric));
update public.creative_picture_holds h
set shape = pg_temp.deus_format(substr(h.shape, 2)::numeric)
where h.shape ~ '^x[0-9]+(\.[0-9]+)?$';

update public.game_ad_control_log l
set target_id = split_part(l.target_id, ':', 1) || ':' || pg_temp.deus_format(substr(split_part(l.target_id, ':', 2), 2)::numeric)
where l.scope = 'picture' and split_part(l.target_id, ':', 2) ~ '^x[0-9]+(\.[0-9]+)?$';

insert into public.schema_versions (version, name)
values ('0066', '0066_one_list_of_shapes')
on conflict (version) do nothing;
