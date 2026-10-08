-- DeusADS 0011 — indexes for the foreign keys of bookings
--
-- APPLIED. Safe to run again. The performance advisor flagged three foreign keys on
-- bookings without a covering index (deleting a creative or a campaign has to find
-- its bookings).

create index if not exists bookings_creative_idx   on public.bookings (creative_id);
create index if not exists bookings_campaign_idx   on public.bookings (campaign_id);
create index if not exists bookings_assignment_idx on public.bookings (assignment_id) where assignment_id is not null;
