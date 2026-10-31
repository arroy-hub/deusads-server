-- DeusADS 0056 - framing can pull a picture back (zoom below 1)
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- crop_zoom 1 stays the plain cover fit. Values from 0.5 to 1 show the whole picture smaller than the frame,
-- with transparent edges, so a picture that was cut at the sides can be fitted in. Existing rows are untouched.

alter table assignments drop constraint if exists assignments_crop_range;
alter table assignments add constraint assignments_crop_range check (
    crop_zoom between 0.5 and 8
    and crop_x between 0 and 1
    and crop_y between 0 and 1
);

insert into public.schema_versions (version, name)
values ('0056', '0056_crop_zoom_out')
on conflict (version) do nothing;
