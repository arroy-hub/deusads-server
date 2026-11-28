-- DeusADS 0064 - how a report about a creative ends: no violation, a request to change it, or a block
--
-- Run once in the Supabase SQL editor (or via the Supabase MCP). Safe to run again.
-- Needs 0063 (a report says which picture) and 0045 (disputes both ways).
--
-- Until now a developer's report ended in one of two ways: the creative was removed or the report was dismissed, and
-- neither side could read why. Now there are three outcomes, a rule the decision points at, and a message to each side.
--
--   creative_disputes.outcome    also 'changes': DeusADS asked the advertiser to change the creative.
--   creative_disputes.rule       the platform rule the decision points at (lib/platform-rules.js), shown to the advertiser.
--   creative_disputes.adv_note   the admin's message to the advertiser (asked for with 'changes' and 'removed').
--   creative_disputes.dev_note   the admin's message to the developer who reported (optional).
--
--   creatives.hold               'changes' (waits for a new version) or 'blocked' (for good); null when nothing holds it.
--                                A held creative has status 'rejected', so nothing shows it, exactly like a removed one
--                                before; a new version sent for review makes it 'pending', and approving it clears the hold.
--   creatives.hold_rule/_note    what the advertiser reads: the rule and the message from DeusADS.
--   creatives.hold_at            when it was put on hold;  hold_dispute  the report that led to it.
--   creatives.hold_sent_at       when the advertiser sent a new version for review.
--   creatives.picture_at         when the main picture was last replaced (a new version).
--   creatives.signal_notified_at when the advertiser was told that many games block this creative (told once).
--
-- The code that ran before this file keeps working with it applied (it never writes the new columns).

alter table public.creative_disputes
    add column if not exists rule     text check (rule is null or char_length(rule) <= 200),
    add column if not exists adv_note text check (adv_note is null or char_length(adv_note) <= 1000),
    add column if not exists dev_note text check (dev_note is null or char_length(dev_note) <= 1000);

alter table public.creative_disputes drop constraint if exists creative_disputes_outcome_check;
alter table public.creative_disputes
    add constraint creative_disputes_outcome_check check (outcome in ('removed', 'paused', 'dismissed', 'changes'));

alter table public.creatives
    add column if not exists hold               text check (hold is null or hold in ('changes', 'blocked')),
    add column if not exists hold_rule          text check (hold_rule is null or char_length(hold_rule) <= 200),
    add column if not exists hold_note          text check (hold_note is null or char_length(hold_note) <= 1000),
    add column if not exists hold_at            timestamptz,
    add column if not exists hold_dispute       uuid references public.creative_disputes (id) on delete set null,
    add column if not exists hold_sent_at       timestamptz,
    add column if not exists picture_at         timestamptz,
    add column if not exists signal_notified_at timestamptz;

-- Creatives removed after a report before this file: they are blocked for good, and say so to the advertiser.
update public.creatives c
set hold = 'blocked',
    hold_note = c.review_note,
    hold_at = coalesce(c.reviewed_at, now()),
    hold_dispute = (select d.id from public.creative_disputes d where d.creative_id = c.id and d.outcome = 'removed' order by d.resolved_at desc nulls last limit 1)
where c.hold is null
  and c.status = 'rejected'
  and c.review_note like 'Removed after a report:%'
  and exists (select 1 from public.creative_disputes d where d.creative_id = c.id and d.outcome = 'removed');

-- A block made together with a report said "pending a DeusADS review" for ever. Once the report is decided the block
-- is simply the developer's choice.
update public.game_picture_blocks b
set reason = 'Blocked by the developer'
where b.reason = 'Blocked pending a DeusADS review'
  and not exists (select 1 from public.creative_disputes d where d.game_id = b.game_id and d.creative_id = b.creative_id and d.status = 'open');

update public.game_ad_controls b
set reason = 'Blocked by the developer'
where b.scope = 'creative'
  and b.reason = 'Blocked pending a DeusADS review'
  and not exists (select 1 from public.creative_disputes d where d.game_id = b.game_id and d.creative_id = b.target_id and d.status = 'open');

insert into public.schema_versions (version, name)
values ('0064', '0064_report_outcomes')
on conflict (version) do nothing;
