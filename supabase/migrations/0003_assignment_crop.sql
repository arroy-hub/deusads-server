-- DeusADS 0003 — how a creative is framed on its placement
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- The SDK cover-fits a creative to the surface. These columns refine that fit:
--   crop_zoom  1 = plain cover fit; 2 = twice as close (half the image width shows)
--   crop_x     horizontal centre of the visible window, 0 = left edge, 1 = right edge
--   crop_y     vertical centre of the visible window,   0 = top edge,  1 = bottom edge
-- The defaults reproduce the fit every placement had before, so existing rows and
-- SDKs that ignore these fields behave exactly as they did.

alter table assignments
    add column if not exists crop_zoom real not null default 1,
    add column if not exists crop_x    real not null default 0.5,
    add column if not exists crop_y    real not null default 0.5;

alter table assignments drop constraint if exists assignments_crop_range;
alter table assignments add constraint assignments_crop_range check (
    crop_zoom between 1 and 8
    and crop_x between 0 and 1
    and crop_y between 0 and 1
);
