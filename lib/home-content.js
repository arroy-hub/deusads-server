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
const TIERS={id:'tiers',type:'news',t:'Countries now come in tiers',d:'28 Oct 2026',s:'Pick Tier 1, 2 or 3 countries in one click when you set up targeting. Single countries still work.',
 body:['Until now, targeting by country meant ticking countries one by one. That is fine for three markets and tiring for thirty. From this week, countries come in three tiers, grouped by how valuable their audience usually is to advertisers.','Tick a tier and every country in it is selected at once. You can still add or remove single countries afterwards, so nothing you set up before changes.','Developers see the tiers in the game details, advertisers in the campaign settings. The same names are used everywhere, so a campaign aimed at Tier 1 will meet a game that lists Tier 1.']};
const GUIDESN={id:'guides',type:'news',t:'New guides: targeting, placements and creatives',d:'28 Oct 2026',s:'Step-by-step guides are now on Home. We add more as questions come in.',
 body:['The questions we hear most often are now answered in short, illustrated guides. You will find them in the Guides block on Home, three for developers and three for advertisers.','Each guide takes three to six minutes and ends with a note on the mistake people make most often. If something is still unclear, tell us and we will improve the guide.','Missing a topic? Tell us what is missing. The next guides are written from your requests.']};
const WELCOME={id:'open',type:'news',t:'Welcome to the DeusADS beta',d:'1 Oct 2026',s:'The dashboard is in beta and shows test data while we get ready for the pilot.',
 body:['DeusADS is a native in-game ad platform, built first for indie VR and mobile games. The dashboard is in beta and currently shows test data, so bugs and inconsistencies are possible.','The pilot runs from mid-November to the end of December 2026. Until full launch we onboard studios and advertisers ourselves. Money does not move yet: earnings run in test mode, and automated deposits and payouts through the platform start at full launch.','Something looks wrong or is missing? Use Help & feedback and tell us.']};

export const NEWS = {
 dev:[{id:'conn',type:'patch',t:'Dashboard update',d:'28 Oct 2026',s:'A game that goes quiet is flagged on Home.',
       lead:'You should not have to notice by yourself that a game has stopped talking to us.',
       items:[['New','Quiet games show up on Home','If we have not heard from the SDK of one of your games for 8 days, the game appears under Needs attention.'],
              ['Improved','Last signal','A game’s page shows when its SDK last sent a signal.']]},
      TIERS,
      GUIDESN,
      {id:'dash20',type:'patch',t:'Dashboard update',d:'20 Oct 2026',s:'Pause or block a campaign in your game.',
       lead:'You decide what runs in your game. This update gives you the controls to say no without leaving the dashboard.',
       items:[['New','Pause or block a campaign in your game','Open the game’s Campaigns tab. Pause stops a campaign for now and keeps its place; block takes it out of your game until you unblock it. Other games are never affected. The advertiser sees that the campaign is paused or blocked in your game, and the reason if you give one.']]},
      {id:'sdk12',type:'patch',t:'SDK 0.12.0',d:'19 Oct 2026',s:'Banners no longer glow in the dark: they follow the light of the scene.',
       lead:'Banners now look like they belong in the scene. In a dark room or at night a banner gets as dark as the objects around it, instead of glowing like a lamp.',
       items:[['New','Adaptive shading','A banner reads the light around it and dims with it, never below a minimum brightness. The artwork stays unshaded, so the colours stay true. It is the new default and works on URP and on the Built-in pipeline.'],
              ['Improved','Control over the effect','Light Influence on each placement sets how closely a banner follows the light, from 0 to 1. Adaptive Min Brightness in the DeusADS settings sets the darkest a banner may get; the default is 30%.'],
              ['Improved','Existing placements switch by themselves','A placement that was Unlit becomes Adaptive. To keep exact, always-bright colours (a screen, a neon sign), pick Unlit in the placement’s Inspector.']]},
      {id:'speed',type:'patch',t:'Dashboard update',d:'19 Oct 2026',s:'Ads reach the game sooner after it starts.',
       lead:'This one is on our side: nothing to update in Unity.',
       items:[['Improved','A faster manifest','The server now does its lookups in parallel and finishes its bookkeeping after it has answered, so the first ads can appear sooner after the game starts.']]},
      {id:'sdk11',type:'patch',t:'SDK 0.11.0',d:'18 Oct 2026',s:'Views are measured to their end, and impressions count more strictly.',
       lead:'This release is about measuring what players really see: a banner counts as seen only when it was properly in view.',
       items:[['New','Views measured to their end','A view stays open while the banner is looked at and closes with its whole length, average distance, share of the screen and angle.'],
              ['New','Interactive placements','Mark a placement Interactive and touches on it during a view are counted: grabbing the object with XR Interaction Toolkit, a mouse or touch press, or ReportInteraction() called from your game.'],
              ['New','Device context','The session now carries the platform, device model, operating system, language and the game’s version. Nothing identifies the person.'],
              ['Improved','Stricter impressions','A banner has to be at least half in frame and not hidden behind other objects, and copies of one placement count as one view.']]},
      WELCOME],
 adv:[TIERS,
      GUIDESN,
      {id:'safe',type:'important',t:'Keep text inside the safe zone',d:'27 Oct 2026',s:'Creatives with text near the edge are cut off in narrow placements.',
       body:['Placements come in different shapes, and a picture is cropped to each one. Text near the edge of a creative can disappear in a narrow shape, which makes the ad hard to read and makes the game look bad.','Our moderators send back creatives that put text outside the safe zone. The safe zone is shown in the creative editor, so you can check it before you upload.','What to do: open your active creatives, switch on the safe zone overlay and move any text that touches the edge.']},
      {id:'dash27',type:'patch',t:'Dashboard update',d:'27 Oct 2026',s:'Pause a campaign until a date, and the editor remembers your crop.',
       lead:'Small changes that save you a trip back to the dashboard.',
       items:[['New','Pause a campaign until a date','Pick the day it should resume and it restarts on its own. No need to come back and switch it on.'],
              ['Improved','The editor remembers your crop','Framing is kept when you replace a creative with one of the same shape, so you do not have to adjust it again.'],
              ['Fixed','Delivery bar in Campaigns','The progress bar no longer shows more than 100% on the last day of a campaign.']]},
      {id:'dash20a',type:'patch',t:'Dashboard update',d:'20 Oct 2026',s:'Duplicate a finished campaign and clearer moderator notes.',
       lead:'Two changes for campaigns that run again and again.',
       items:[['New','Duplicate a finished campaign','Keep running with the same games, dates length and creatives. Duplicate from Needs attention or from the campaign page.'],
              ['Improved','Clearer moderator notes','A rejected creative now shows exactly what to fix, next to the picture.']]},
      {id:'dash6',type:'patch',t:'Dashboard update',d:'9 Oct 2026',s:'Safe zone in the creative editor.',
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
  dev: { title: "SDK 0.12.0 is out", text: "Banners now dim with the scene’s light, so they no longer glow in the dark." },
  adv: { title: "Pause a campaign until a date", text: "Pick the day it should resume — it restarts on its own, no need to come back." },
};

export const slugOf = (title) => String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const guideBySlug = (slug) => {
  const title = Object.keys(ART).find((key) => slugOf(key) === slug);
  return title ? { title, ...ART[title] } : null;
};
/** Which role's list a guide belongs to (for the “More guides” column). */
export const roleOfGuide = (title) => (GUIDE_LIST.dev.includes(title) ? "dev" : "adv");
