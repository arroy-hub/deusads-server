-- Internal notes on a dispute (the "Add note" button on a dispute card): visible to admins only.
-- Until this is applied the cabinet works, and "Add note" says to run this file first.

alter table public.dispute_events drop constraint if exists dispute_events_kind_check;
alter table public.dispute_events
    add constraint dispute_events_kind_check check (kind in ('opened', 'reply', 'decision', 'note'));

insert into public.schema_versions (version, name)
values ('0046', '0046_dispute_notes')
on conflict (version) do nothing;
