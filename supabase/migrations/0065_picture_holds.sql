-- DeusADS 0065 - a report stops the reported picture, not the whole creative
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0064 (report outcomes) and 0063 (a report says which picture).
--
-- With 0064 a request to change a creative, or a block, stopped the creative in every shape, although the report is
-- about one picture: a creative in one shape. A campaign with a single creative went dark in every game.
--
--   creative_picture_holds    one row per creative and shape that DeusADS holds: 'changes' (waits for a new picture
--                             of that shape) or 'blocked' (for good). The creative itself stays approved and its other
--                             shapes keep running. `rule` and `note` are what the advertiser reads, `dispute_id` the
--                             report that led to it, `sent_at` when a new picture for the shape was sent for review.
--                             Approving that picture removes the row.
--   creatives.hold            stays for reports about a whole creative (no shape): the ones made before 0063.
--
-- Holds made since 0064 on a report that names a picture move to the new table, and those creatives run again in
-- their other shapes.
--
-- The code that ran before this file keeps working with it applied.

create table if not exists public.creative_picture_holds (
    creative_id uuid not null references public.creatives (id) on delete cascade,
    shape       text not null check (char_length(shape) between 1 and 24),
    kind        text not null check (kind in ('changes', 'blocked')),
    rule        text check (rule is null or char_length(rule) <= 200),
    note        text check (note is null or char_length(note) <= 1000),
    dispute_id  uuid references public.creative_disputes (id) on delete set null,
    held_at     timestamptz not null default now(),
    sent_at     timestamptz,
    primary key (creative_id, shape)
);
create index if not exists creative_picture_holds_dispute_idx on public.creative_picture_holds (dispute_id);

-- Read and written only by the server (service role), which checks who is calling.
alter table public.creative_picture_holds enable row level security;
revoke all on public.creative_picture_holds from public, anon, authenticated;

insert into public.creative_picture_holds (creative_id, shape, kind, rule, note, dispute_id, held_at)
select c.id, d.shape, c.hold, c.hold_rule, c.hold_note, c.hold_dispute, coalesce(c.hold_at, now())
from public.creatives c
join public.creative_disputes d on d.id = c.hold_dispute
where c.hold is not null and d.shape is not null
on conflict (creative_id, shape) do nothing;

update public.creatives c
set status = 'approved', review_note = null, reviewed_at = now(),
    hold = null, hold_rule = null, hold_note = null, hold_at = null, hold_dispute = null, hold_sent_at = null
where c.hold is not null
  and exists (select 1 from public.creative_disputes d where d.id = c.hold_dispute and d.shape is not null);

insert into public.schema_versions (version, name)
values ('0065', '0065_picture_holds')
on conflict (version) do nothing;
