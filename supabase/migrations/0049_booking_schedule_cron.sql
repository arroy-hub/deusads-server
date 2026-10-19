-- 0049: the booking schedule runs by itself, every minute, inside the database.
--
-- What it does:
--   1. Switches on the pg_cron extension.
--   2. Schedules `select public.sync_booking_schedule()` (0013, 0015) once a minute: a booking whose
--      start day has come goes live, and one whose end day has passed ends, even when no player is
--      starting a game. Until now only GET /v1/manifest triggered it, and the request that ran it waited for it.
--
-- Needs: 0013 and 0015 (the function). Safe to run twice: the job has a name, so scheduling it again only
-- replaces it. If `create extension` is refused, switch pg_cron on in the Supabase dashboard
-- (Database > Extensions) and run this again.
--
-- What the code does until this is applied: GET /v1/manifest still asks for the sync, at most once a minute
-- per server instance, but only after it has answered. A booking then starts at the next game start at the
-- latest. Nothing breaks if this is never applied.

create extension if not exists pg_cron;

select cron.schedule(
  'deusads-sync-booking-schedule',
  '* * * * *',
  $$select public.sync_booking_schedule()$$
);

insert into public.schema_versions (version, name)
values ('0049', '0049_booking_schedule_cron')
on conflict (version) do nothing;
