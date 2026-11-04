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
const TIERS={id:'tiers',type:'news',t:'Countries now come in tiers',d:'4 Aug 2026',s:'Pick Tier 1, 2 or 3 countries in one click when you set up targeting. Single countries still work.',
 body:['Until now, targeting by country meant ticking countries one by one. That is fine for three markets and tiring for thirty. From this week, countries come in three tiers, grouped by how valuable their audience usually is to advertisers.','Tick a tier and every country in it is selected at once. You can still add or remove single countries afterwards, so nothing you set up before changes.','Developers see the tiers in the game details, advertisers in the campaign settings. The same names are used everywhere, so a campaign aimed at Tier 1 will meet a game that lists Tier 1.']};
const GUIDESN={id:'guides',type:'news',t:'New guides: targeting, placements and creatives',d:'28 Oct 2026',s:'Step-by-step guides are now on Home. We add more as questions come in.',
 body:['The questions we hear most often are now answered in short, illustrated guides. You will find them in the Guides block on Home, three for developers and three for advertisers.','Each guide takes three to six minutes and ends with a note on the mistake people make most often. If something is still unclear, tell us and we will improve the guide.','Missing a topic? Tell us what is missing. The next guides are written from your requests.']};
const MAINT_BODY=['Your games are not affected. The SDK keeps showing ads from the manifest it saved last, and impressions are queued and delivered as soon as we are back.','What to do: nothing. If something looks wrong afterwards, write to us and we will look at it first.'];
const MAINT1={id:'mnt1',type:'important',t:'Scheduled maintenance on 11 Jul',d:'8 Jul 2026',s:'A short break around 01:00 UTC while we update the server.',
 body:['On the night of 11 July we are rolling out updates on the server. From about 01:00 to 01:20 UTC the dashboard and sign-in may be unavailable, and a few requests may fail.',...MAINT_BODY]};
const MAINT2={id:'mnt2',type:'important',t:'Scheduled maintenance on 26 Sep',d:'22 Sep 2026',s:'A short break around 02:00 UTC while we update the server.',
 body:['On the night of 26 September we are updating the server again. From about 02:00 to 02:30 UTC the dashboard and sign-in may be unavailable, and a few requests may fail.',...MAINT_BODY]};

export const NEWS = {
 dev:[{id:'conn',type:'patch',t:'Dashboard update',d:'28 Oct 2026',s:'A game that goes quiet is flagged on Home.',
       lead:'Home now keeps an eye on the connection of your games, so you do not have to check each one by hand. A game that has gone quiet is shown where you will see it first.',
       items:[['New','Quiet games show up on Home','If we have not heard from the SDK of one of your games for 8 days, the game appears under Needs attention with the number of days it has been quiet. Open it to see the last signal and what to check.'],
              ['Improved','Last signal','A game’s page shows when its SDK last sent a signal. That way you can tell a game that went quiet from one that was never connected.']]},
      GUIDESN,
      {id:'sdk12',type:'patch',t:'SDK 0.12.0',d:'15 Oct 2026',s:'Banners no longer glow in the dark: they follow the light of the scene.',
       lead:'Banners now look like they belong in the scene. In a dark room or at night a banner gets as dark as the objects around it, instead of glowing like a lamp.',
       items:[['New','Adaptive shading','A banner reads the light around it and dims with it, never below a minimum brightness. The artwork stays unshaded, so the colours stay true. It is the new default and works on URP and on the Built-in pipeline.'],
              ['Improved','Control over the effect','Light Influence on each placement sets how closely a banner follows the light, from 0 to 1. Adaptive Min Brightness in the DeusADS settings sets the darkest a banner may get; the default is 30%.'],
              ['Improved','Existing placements switch by themselves','A placement that was Unlit becomes Adaptive. To keep exact, always-bright colours (a screen, a neon sign), pick Unlit in the placement’s Inspector.']]},
      {id:'speed',type:'patch',t:'Dashboard update',d:'27 Sep 2026',s:'Ads reach the game sooner after it starts.',
       lead:'This one is on our side: there is nothing to update in Unity. It is about how soon a game gets its ads after it starts, which matters most for the first seconds of a session.',
       items:[['Improved','A faster manifest','The manifest is the list of ads a game asks for when it starts. The server now does its lookups in parallel and finishes its bookkeeping after it has answered, so the first ads can appear sooner after the game starts.'],
              ['Improved','Quieter background work','Some recalculations that used to run while a game waited for its answer now run on a schedule in the background, so they no longer add to the waiting time.']]},
      MAINT2,
      {id:'sdk11',type:'patch',t:'SDK 0.11.0',d:'9 Sep 2026',s:'Views are measured to their end, and impressions count more strictly.',
       lead:'This release is about measuring what players really see: a banner counts as seen only when it was properly in view.',
       items:[['New','Views measured to their end','A view stays open while the banner is looked at and closes with its whole length, average distance, share of the screen and angle.'],
              ['New','Interactive placements','Mark a placement Interactive and touches on it during a view are counted: grabbing the object with XR Interaction Toolkit, a mouse or touch press, or ReportInteraction() called from your game.'],
              ['New','Device context','The session now carries the platform, device model, operating system, language and the game’s version. Nothing identifies the person.'],
              ['Improved','Stricter impressions','A banner has to be at least half in frame and not hidden behind other objects, and copies of one placement count as one view.']]},
      TIERS,
      {id:'dash20',type:'patch',t:'Dashboard update',d:'14 Jul 2026',s:'More control over what runs in your game.',
       lead:'You decide what runs in your game. This update adds controls to the game’s Campaigns tab for saying no without leaving the dashboard.',
       items:[['Improved','Pause or block a campaign in one game','Pause stops a campaign for now and keeps its place; block takes it out of your game until you unblock it. Other games are never affected.'],
              ['New','Say why when you block','You can add a reason. The advertiser sees that the campaign is paused or blocked in your game, and the reason if you give one, so they know what to change.'],
              ['New','Blocked items in a filter','Blocked campaigns, creatives and advertisers stay in a filter, so you can find any of them later and unblock it.']]},
      MAINT1,
      {id:'dash0',type:'patch',t:'Dashboard update',d:'12 May 2026',s:'More ways to read the Performance tab.',
       lead:'The Performance tab already shows how your banners are doing. This update gives you more ways to look at the same figures, without changing anything you see today.',
       items:[['New','Compare with the previous period','Switch on the comparison and the figures and charts are shown next to the stretch of time just before the one you picked, so you can see at a glance whether your banners are picking up or slowing down.'],
              ['Improved','Chart settings in one place','The View button collects the chart options in one panel. Pick the figure and what to split it by, and the chart follows.'],
              ['New','Export a table to CSV','Download the table you are looking at and open it in a spreadsheet, for example to share it with your team.']]}],
 adv:[GUIDESN,
      {id:'dash27',type:'patch',t:'Dashboard update',d:'21 Oct 2026',s:'Pause a campaign until a date, and the editor remembers your crop.',
       lead:'Small changes that save you a trip back to the dashboard. They are about campaigns that are already running.',
       items:[['New','Pause a campaign until a date','Pick the day it should resume and it restarts on its own. No need to come back and switch it on, which is handy for a break over a holiday or between two promotions.'],
              ['Improved','The editor remembers your crop','When you replace a creative with one of the same shape, the framing you chose is kept, so you do not have to adjust it again.'],
              ['Fixed','Delivery bar in Campaigns','The progress bar no longer goes past 100% on the last day of a campaign, so the bar and the number beside it agree.']]},
      {id:'dash6',type:'patch',t:'Dashboard update',d:'9 Oct 2026',s:'Safe zone in the creative editor.',
       lead:'One picture is cropped to every placement shape, and it is not always obvious which part always stays visible. The editor now shows it.',
       items:[['New','Safe zone overlay','A light frame over the picture marks the area that is visible in every placement shape. Keep logos and text inside it and they will never be cut off.'],
              ['New','Move the frame to fit your picture','You can move and zoom the safe zone over the creative, so that it covers what matters in this particular picture.'],
              ['Improved','Every shape on one screen','The same screen shows how the picture will look in each placement shape, so you can check them one after another before you save.']]},
      {id:'dash20a',type:'patch',t:'Dashboard update',d:'27 Sep 2026',s:'Duplicate a finished campaign, and clearer moderator notes.',
       lead:'Two changes for campaigns that run again and again. Both save you steps you would otherwise repeat by hand.',
       items:[['New','Duplicate a finished campaign','Start a new run with the same games and creatives in one click, then change only what is different, for example the dates. You can duplicate from the campaign page or from the menu in the campaigns list.'],
              ['Improved','Clearer moderator notes','When a creative is sent back, the note now says exactly what to fix and sits next to the picture, so you can correct it and upload again without guessing.']]},
      MAINT2,
      TIERS,
      {id:'adv15',type:'patch',t:'Dashboard update',d:'15 Jul 2026',s:'More ways to read your Overview.',
       lead:'Your Overview already shows how your campaigns are doing. This update adds a few ways to look at the same numbers more closely, without changing anything you rely on today.',
       items:[['New','Compare with the previous period','Switch on the comparison and every figure and chart is shown next to the stretch of time just before the one you picked, so you can see at a glance whether a campaign is picking up or slowing down.'],
              ['Improved','Widgets you can arrange','The figures are shown in widgets that you can choose and arrange, so an account with many campaigns can keep on screen only what it needs.'],
              ['Improved','Chart settings in one place','The View button on the Overview chart collects the chart options in one panel. Pick the figure and what to split it by, and the chart follows.']]},
      MAINT1,
      {id:'adv0',type:'patch',t:'Dashboard update',d:'20 May 2026',s:'Find campaigns faster, and plan with a reach estimate.',
       lead:'Accounts with many campaigns asked for quicker ways to find the right one. This update is about finding things and planning ahead, and it leaves everything you already use as it was.',
       items:[['Improved','Search, filters and sorting in Campaigns','Type a name, narrow the list by status and sort it the way you need. The filters you pick appear as small chips above the list, so you always see why a campaign is or is not shown.'],
              ['New','Reach estimate while you plan','When you choose games and countries for a campaign, you now see roughly how many games it can reach before you start it, so you can widen the audience if it is too narrow.'],
              ['Fixed','Dates in other time zones','Start and end dates now follow your account time zone, so a campaign set for Monday begins on Monday wherever you are.']]}]
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
