-- 0053: the assistant's starting guide.
-- Adds the first answers to the guide (support_articles) only when the guide is still empty, so running it twice, or
-- after answers were written by hand, changes nothing. The admin edits, switches off or deletes them under
-- Support -> Assistant -> Knowledge. The answer about payouts is added switched off until payments exist.

insert into public.support_articles (title, keywords, answer, more, enabled)
select v.title, v.keywords, v.answer, v.more, v.enabled
from (values
    ('Where is my API key?', 'api key, key',
     'Open your game, then the Settings tab. The API key and its copy button are there.',
     'Paste it into Unity at Tools → DeusADS → Settings, then press Send placements.', true),
    ('Why is my placement not showing?', 'not show, placement, empty, blank',
     'A placement is off if it, its scene or its folder is switched off. Check all three.',
     'Also check that the game''s genres, platforms and languages are filled in. Changes reach players at their next launch.', true),
    ('How do I pause or block a campaign?', 'pause, block, campaign',
     'Open the Campaigns tab of your game. You can pause or block a campaign, a single creative or an advertiser.',
     'Blocks are reversible, and you can give the advertiser a reason.', true),
    ('How do I connect the SDK?', 'sdk, unity, connect, install',
     'Add the DeusADS package in Unity, paste the key into Tools → DeusADS → Settings and press Send placements.',
     'The game card shows Connected once the SDK has asked for its manifest.', true),
    ('Which creative sizes are supported?', 'size, format, creative, crop',
     'Upload a PNG or JPG; it is cropped to every standard shape.',
     'The safe-zone frame is adjustable in the creative editor.', true),
    ('I cannot sign in', 'sign in, login, password',
     'Use Forgot password on the login page; the link arrives by email.',
     'If the email does not arrive within a few minutes, check the spam folder.', true),
    ('How are impressions counted?', 'impression, count, stats',
     'An impression is counted when the creative has been visible to the player long enough.',
     'The report shows the average visible time per campaign.', true),
    ('When do payouts start?', 'payout, money, earn, revenue, pay',
     'Payments are not switched on yet. For now the cabinet shows impressions and engagement only.',
     'Money metrics will come later.', false)
) as v (title, keywords, answer, more, enabled)
where not exists (select 1 from public.support_articles);

insert into public.schema_versions (version, name)
values ('0053', '0053_support_guide_seed')
on conflict (version) do nothing;
