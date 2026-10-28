// What the Home page teaches and announces: guides, news and tips. Plain data, so it can be tested and later moved to the database.

export const ART = {
 'Connect Unity in 5 minutes':{min:5,intro:'Paste the key, press Send placements and see your game turn “Connected”. It takes about five minutes the first time.',steps:[['Add the package','In Unity open Window → Package Manager → Add package from git URL and paste the DeusADS SDK address.'],['Paste your game key','Open Tools → DeusADS → Settings and paste the key from your game’s Settings tab.'],['Press Send placements','The SDK finds every ad spot in your scenes and sends the list to the dashboard.'],['Check the status','Back in the dashboard your game turns “Connected”. If it does not, see the note below.']],note:['No signal?','Make sure the game was run once with the key inside. Status updates after the first session.']},
 'Placements, scenes and folders':{min:4,intro:'Every ad spot in your game is a placement. Placements live in scenes, and you can group them in folders to switch several of them at once.',steps:[['A placement shows ads only when three things are on','The placement, its scene and its folder. If any of them is off, nothing shows there.'],['Use folders to pause many placements','Turn a folder off to pause everything inside it. Turn it back on and ads return.'],['Switch off instead of deleting','Switching keeps your framing and history. Deleting a placement cannot be undone.']],note:['Why is a placement empty?','Check its scene and folder first, then whether any campaign targets your game.']},
 'Fill in targeting':{min:3,intro:'Genres, platforms, languages and countries decide which campaigns can reach your game. The more you fill in, the better the match.',steps:[['Open the game details','In My games pick the game and open the Details tab.'],['Choose genres and platforms','Pick what really describes the game. Advertisers filter by these.'],['Add languages and countries','Where your players are. Campaigns aimed at other countries will not be shown.']],note:['Good to know','You can change targeting any time. Running campaigns re-check it on the next manifest load.']},
 'Your first campaign in 4 steps':{min:6,intro:'From uploading a creative to the moderator’s approval, in four steps.',steps:[['Upload a creative','A PNG or JPG. We crop it to every placement shape automatically.'],['Create a campaign','Give it a name, say what you advertise and set the dates.'],['Pick games and dates','Choose where it runs and for how long.'],['Review and start','A moderator checks it before it goes live. You get a notification when it is approved.']],note:['Waiting for moderation?','Most campaigns are reviewed within a day. A rejected creative appears in Needs attention with a note.']},
 'Creative shapes and the safe zone':{min:4,intro:'One picture is cropped to every placement shape. Keep text inside the safe zone so it is never cut off.',steps:[['Open the creative editor','Pick a creative and open Framing.'],['Check each shape','Square, wide and tall placements crop the picture differently.'],['Move and zoom the crop','Drag the picture so the important part stays inside the safe zone.']],note:['Rejected for text outside the safe zone?','Move the text inward and upload again. The campaign keeps its place.']},
 'Pausing and stopping a campaign':{min:3,intro:'What each option does, and what can be undone.',steps:[['Pause','Ads stop showing and the campaign keeps its place. Resume any time.'],['Pause until a date','Pick the day it resumes. It restarts on its own.'],['Stop','Ends the campaign for good. A stopped campaign can only be duplicated.']],note:['Not sure?','Pause. It is always reversible.']}
};
export const GUIDE_LIST = {dev:['Connect Unity in 5 minutes','Placements, scenes and folders','Fill in targeting'],adv:['Your first campaign in 4 steps','Creative shapes and the safe zone','Pausing and stopping a campaign']};
const TIERS={id:'tiers',type:'news',t:'Countries now come in tiers',d:'24 Oct 2026',s:'Pick Tier 1, 2 or 3 countries in one click when you set up targeting. Single countries still work.',
 body:['Until now, targeting by country meant ticking countries one by one. That is fine for three markets and tiring for thirty. From this week, countries come in three tiers, grouped by how valuable their audience usually is to advertisers.','Choose “Tier 1 and 2” and every country in those groups is selected at once. You can still add or remove single countries afterwards, so nothing you set up before changes.','Developers see the tiers in the game details, advertisers in the campaign settings. The same names are used everywhere, so a campaign aimed at Tier 1 will meet a game that lists Tier 1.']};
const GUIDESN={id:'guides',type:'news',t:'New guides: targeting, placements and creatives',d:'15 Oct 2026',s:'Step-by-step guides are now on Home. We add more as questions come in.',
 body:['The questions we hear most often are now answered in short, illustrated guides. You will find them in the Guides block on Home, three for developers and three for advertisers.','Each guide takes three to six minutes and ends with a note on the mistake people make most often. If something is still unclear, tell us and we will improve the guide.','Missing a topic? Tell us what is missing. The next guides are written from your requests.']};
const WELCOME={id:'open',type:'news',t:'Welcome to DeusADS',d:'1 Oct 2026',s:'The dashboard is open to the first developers and advertisers.'};

export const NEWS = {
 dev:[{id:'mnt',type:'important',t:'Scheduled maintenance on 1 Nov',d:'28 Oct 2026',s:'The dashboard will be unavailable for about 20 minutes from 06:00 UTC.',
       body:['On 1 November we are moving the dashboard to a bigger server. From 06:00 to about 06:20 UTC the dashboard and sign-in will not be available.','Your games are not affected. The SDK keeps showing ads from the manifest it saved last, and impressions are queued and delivered as soon as we are back.','What to do: nothing. If something looks wrong afterwards, write to us and we will look at it first.']},
      {id:'sdk12',type:'patch',t:'SDK 0.12.0',d:'27 Oct 2026',s:'Faster manifest, a clearer connection status and a fix for removed placements.',
       lead:'This release is about speed. Ads now appear noticeably sooner after the game starts, and you can see at a glance whether the SDK is talking to us.',
       items:[['New','A faster manifest','We cut the work the server does before it answers the SDK, so the first ads can appear within moments of the first scene loading. Update the package in Unity and you are done; nothing else changes.'],
              ['Improved','A clearer connection status','Every game card now shows when the SDK last sent a signal. If a game goes quiet, it moves to Needs attention on Home instead of silently showing no ads.'],
              ['Fixed','Removed placements stay removed','Placements you delete in Unity used to linger in the dashboard as active. They now disappear the next time you press Send placements.']]},
      TIERS,
      {id:'dash20',type:'patch',t:'Dashboard update',d:'20 Oct 2026',s:'Pause or block a campaign in your game, and pick countries in groups.',
       lead:'You decide what runs in your game. This update gives you the controls to say no without leaving the dashboard.',
       items:[['New','Pause or block a campaign in your game','Open the game’s Campaigns tab. Pause stops a campaign for now and keeps its place; block removes it from your game for good. Other games are never affected.'],
              ['Improved','Targeting by country','Countries can be picked in groups, so setting up a game takes seconds instead of minutes.']]},
      GUIDESN,
      {id:'sdk11',type:'patch',t:'SDK 0.11.0',d:'6 Oct 2026',s:'Send placements from Unity with one button.',
       lead:'Connecting a game used to take several manual steps. Now it takes one button.',
       items:[['New','Send placements from Unity','One button finds every ad spot in your scenes and sends the list to the dashboard.'],
              ['Fixed','Empty placements after a scene reload','The SDK now refreshes the manifest when a scene loads, so a placement is no longer empty after you change levels.']]},
      WELCOME],
 adv:[{id:'safe',type:'important',t:'From 1 Nov text outside the safe zone is rejected',d:'27 Oct 2026',s:'Creatives with text near the edge are cut off in narrow placements.',
       body:['Placements come in different shapes, and a picture is cropped to each one. Text near the edge of a creative can disappear in a narrow shape, which makes the ad hard to read and makes the game look bad.','From 1 November our moderators reject creatives that put text outside the safe zone. The safe zone is shown in the creative editor, so you can check it before you upload.','What to do: open your active creatives, switch on the safe zone overlay and move any text that touches the edge.']},
      {id:'dash27',type:'patch',t:'Dashboard update',d:'27 Oct 2026',s:'Pause a campaign until a date, and the editor remembers your crop.',
       lead:'Small changes that save you a trip back to the dashboard.',
       items:[['New','Pause a campaign until a date','Pick the day it should resume and it restarts on its own. No need to come back and switch it on.'],
              ['Improved','The editor remembers your crop','Framing is kept when you replace a creative with one of the same shape, so you do not have to adjust it again.'],
              ['Fixed','Delivery bar in Campaigns','The progress bar no longer shows more than 100% on the last day of a campaign.']]},
      {id:'games',type:'news',t:'Six new VR games joined this week',d:'25 Oct 2026',s:'They are available for targeting now: racing, arcade and two party games.',
       body:['Six new games connected the SDK this week: a racing game, two arcade games and two party games, plus one more in early access.','They are available for targeting now. If your campaign is behind plan, adding one of them is the quickest way to give it more places to run.']},
      TIERS,
      {id:'dash20a',type:'patch',t:'Dashboard update',d:'20 Oct 2026',s:'Duplicate a finished campaign and clearer moderator notes.',
       lead:'Two changes for campaigns that run again and again.',
       items:[['New','Duplicate a finished campaign','Keep running with the same games, dates length and creatives. Duplicate from Needs attention or from the campaign page.'],
              ['Improved','Clearer moderator notes','A rejected creative now shows exactly what to fix, next to the picture.']]},
      GUIDESN,
      {id:'dash6',type:'patch',t:'Dashboard update',d:'6 Oct 2026',s:'Safe zone in the creative editor.',
       lead:'You can now see which part of a picture is never cropped.',
       items:[['New','Safe zone in the creative editor','A light overlay shows the area that is visible in every placement shape. Keep logos and text inside it.'],
              ['Fixed','Dates in other time zones','Start and end dates now follow your account time zone.']]},
      WELCOME]
};
export const NTYPE = {important:['Important','warn','warn'],patch:['Patch','sched','box'],news:['News','ans','mega']};

/** Tips, [title, text], shown one at a time. */
export const TIPS = {
 "dev": [
  [
   "Switch off, don’t delete",
   "A placement shows ads only when it, its scene and its folder are all on. Turn a folder off to pause several placements at once."
  ],
  [
   "Keep the SDK up to date",
   "New SDK versions load the manifest faster, so ads appear sooner after the game starts. Check the version in each game’s settings."
  ],
  [
   "Fill in the targeting",
   "Genres, platforms, languages and countries decide which campaigns can reach your game. The more you fill in, the better the match."
  ],
  [
   "Block what doesn’t fit",
   "You can pause or block any campaign in a game. Other games and other placements are not affected."
  ]
 ],
 "adv": [
  [
   "Check the framing before launch",
   "Every creative is cropped to each placement shape. Open the creative editor to move and zoom the crop for the shapes that matter most."
  ],
  [
   "Pause until a date",
   "Pick the day a campaign should resume and it restarts on its own. No need to come back and switch it on."
  ],
  [
   "Add more games to catch up",
   "If a campaign is behind plan, adding games or creatives gives it more places to run."
  ],
  [
   "Keep text inside the safe zone",
   "Text near the edge can be cut off in narrow placements. Keep it inside the safe zone shown in the editor."
  ]
 ]
};

/** The three guide cards on Home: [title, short text, icon]. */
export const GUIDE_CARDS = {
  dev: [
    ["Connect Unity in 5 minutes", "Paste the key, press Send placements and see your game turn “Connected”."],
    ["Placements, scenes and folders", "Why a placement may not show, and how switching things on and off works."],
    ["Fill in targeting", "Genres, platforms, languages and countries decide which campaigns can reach your game."],
  ],
  adv: [
    ["Your first campaign in 4 steps", "From uploading a creative to the moderator’s approval."],
    ["Creative shapes and the safe zone", "How one picture is cropped to every placement shape, and how to adjust it."],
    ["Pausing and stopping a campaign", "What each option does, and what can be undone."],
  ],
};

/** The newest item that is not a notice, for the What’s new block. */
export const LATEST = {
  dev: { title: "SDK 0.12.0 is out", text: "The manifest loads faster, so ads appear sooner after the game starts." },
  adv: { title: "Pause a campaign until a date", text: "Pick the day it should resume — it restarts on its own, no need to come back." },
};

export const slugOf = (title) => String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const guideBySlug = (slug) => {
  const title = Object.keys(ART).find((key) => slugOf(key) === slug);
  return title ? { title, ...ART[title] } : null;
};
/** Which role's list a guide belongs to (for the “More guides” column). */
export const roleOfGuide = (title) => (GUIDE_LIST.dev.includes(title) ? "dev" : "adv");
