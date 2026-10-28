// What the developer Home and the advertiser Home show, worked out from plain counts.

/**
 * The developer's path from nothing to an ad running, as ordered steps.
 * Exactly one step is "next": the first that is not done.
 */
export function developerSteps({ games = 0, placements = 0, open = 0, approved = 0 }) {
  const steps = [
    { key: "game", title: "Create a game", hint: "Name it and get an SDK key.", done: games > 0, href: "/dashboard/games" },
    { key: "sdk", title: "Connect the Unity SDK", hint: "Press Send placements in Unity.", done: placements > 0, href: "/dashboard/games" },
    { key: "open", title: "Open placements to advertisers", hint: "Choose what advertisers can book.", done: open > 0, href: "/dashboard/games" },
    { key: "approve", title: "See your first ad running", hint: "Ads go live as soon as an advertiser books an open placement.", done: approved > 0, href: "/dashboard/games" },
  ];
  const next = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, state: step.done ? "done" : index === next ? "next" : "later" }));
}

/** Stage counts of an advertiser's bookings: waiting (pending or scheduled), live, finished (from bookingLabel text). */
export function advertiserPipeline({ creatives = [], campaigns = [], bookings = [] }) {
  const approvedCreatives = creatives.filter((item) => item.status === "approved").length;
  const waitingCreatives = creatives.filter((item) => item.status === "pending").length;
  const used = new Set(bookings.map((booking) => booking.campaignId));
  const drafts = campaigns.filter((campaign) => !used.has(campaign.id)).length;
  const labelOf = (booking) => String(booking.label ?? "");
  const waiting = bookings.filter((booking) => booking.status === "pending" || labelOf(booking).startsWith("Scheduled")).length;
  const live = bookings.filter((booking) => booking.status === "approved" && labelOf(booking).startsWith("Live")).length;
  const finished = bookings.filter((booking) => booking.status === "ended" || labelOf(booking) === "Ended").length;
  return {
    creatives: creatives.length,
    approvedCreatives,
    waitingCreatives,
    drafts,
    waiting,
    live,
    finished,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The Home page (/dashboard/home): the checklist, what needs attention and which mode the page is in.

/** A new account has nothing yet: no game for a developer, no creative and no campaign for an advertiser. */
export function homeMode(role, { games = 0, creatives = 0, campaigns = 0 } = {}) {
  if (role === "advertiser") return creatives + campaigns === 0 ? "new" : "active";
  return games === 0 ? "new" : "active";
}

/** The developer's checklist: [{ key, title, hint, action, href, done }], the first open one is `current`. */
export function developerChecklist({ games = 0, detailsFilled = 0, connected = 0, placements = 0 }) {
  const done = [games > 0, games > 0 && detailsFilled >= games, connected > 0, placements > 0];
  const steps = [
    { key: "game", title: "Add your game", hint: "Name, icon and engine", action: "Add game", href: "/dashboard/games" },
    { key: "details", title: "Fill in the game details", hint: "Description, genres, platforms, languages, countries", action: "Fill in", href: "/dashboard/games" },
    { key: "sdk", title: "Connect the SDK", hint: "Unity: Tools → DeusADS → Settings, paste the key", action: "Show how", href: "/dashboard/home/guides/connect-unity-in-5-minutes" },
    { key: "placements", title: "Send your placements", hint: "Press “Send placements” in Unity", action: "Show how", href: "/dashboard/home/guides/connect-unity-in-5-minutes" },
  ];
  return withCurrent(steps.map((step, index) => ({ ...step, done: done[index] })));
}

/** The advertiser's checklist: a creative, a campaign, games and dates picked, then a moderator’s review. */
export function advertiserChecklist({ creatives = 0, campaigns = 0, bookings = 0, started = 0 }) {
  const done = [creatives > 0, campaigns > 0, bookings > 0, started > 0];
  const steps = [
    { key: "creative", title: "Upload a creative", hint: "A PNG or JPG — we crop it to every shape", action: "Upload", href: "/dashboard/creatives" },
    { key: "campaign", title: "Create a campaign", hint: "Name, what you advertise, dates", action: "Create", href: "/dashboard/advertising/new" },
    { key: "games", title: "Pick games and dates", hint: "Choose where it runs and for how long", action: "Choose", href: "/dashboard/advertising" },
    { key: "review", title: "Review and start", hint: "A moderator checks it before it goes live", action: "Review", href: "/dashboard/advertising" },
  ];
  return withCurrent(steps.map((step, index) => ({ ...step, done: done[index] })));
}

function withCurrent(steps) {
  const current = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, current: index === current }));
}

/** The look of a Needs attention strip for each tone of the bell ("bad" | "warn" | "info"). */
const STRIP_TONE = { bad: "stop", warn: "warn", info: "sched" };
const STRIP_ICON = { rejected: "image", "dispute-removed": "ban", dispute: "flag", limited: "ban", gap: "image", ending: "clock" };

/** An advertiser's attention items (lib/advertiser-overview.js attentionItems) as Home strips. */
export function advertiserStrips(items = []) {
  return items.map((item) => ({
    key: item.key,
    tone: STRIP_TONE[item.tone] ?? "warn",
    icon: STRIP_ICON[String(item.key).split(":")[0]] ?? "alert",
    title: item.title,
    text: item.text,
    action: item.action,
    href: item.href,
    primary: item.tone === "bad",
  }));
}

const DAY = 86_400_000;
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * What needs a developer's eye, most urgent first:
 *   games      [{ id, name, placements, lastSignalAt, quietDays }]  quietDays: whole days without a signal (null = never heard)
 *   campaigns  [{ id, gameId, game, advertiser, campaign, startsOn }]  campaigns that started in or will start near a game
 *   now        Date.now()
 */
export function developerStrips({ games = [], campaigns = [], now = Date.now(), quietFrom = 8 } = {}) {
  const items = [];
  for (const game of games) {
    if (game.quietDays != null && game.quietDays >= quietFrom) {
      items.push({ key: `quiet:${game.id}`, tone: "warn", icon: "plug", title: `${game.name} lost its connection`, text: `No signal from the SDK for ${game.quietDays} days · its ${plural(game.placements, "placement", "placements")} ${game.placements === 1 ? "is" : "are"} not updating`, action: "Open game", href: `/dashboard/g/${game.id}` });
    } else if (game.placements === 0) {
      items.push({ key: `empty:${game.id}`, tone: "warn", icon: "flag", title: `${game.name} has no placements yet`, text: "Press Send placements in Unity to report them.", action: "Open game", href: `/dashboard/g/${game.id}` });
    }
  }
  const today = new Date(now).toISOString().slice(0, 10);
  for (const item of campaigns) {
    const gap = Math.round((Date.parse(`${item.startsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
    if (!Number.isFinite(gap) || gap < -3 || gap > 3) continue;
    const when = gap === 0 ? "started today" : gap < 0 ? (gap === -1 ? "started yesterday" : `started ${-gap} days ago`) : gap === 1 ? "starts tomorrow" : `starts in ${gap} days`;
    items.push({ key: `campaign:${item.id}`, tone: "sched", icon: "mega", title: `New campaign in ${item.game}`, text: `${item.advertiser} · ${item.campaign} ${when} · you can pause or block it`, action: "Review", href: `/dashboard/g/${item.gameId}` });
  }
  const order = { warn: 0, sched: 1 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** The label for a notification time: "Today 09:40", "Yesterday", "5 days ago", "1 Oct". */
export function activityWhen(at, now = Date.now()) {
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse(then.toISOString().slice(0, 10))) / DAY);
  if (days <= 0) return `Today ${then.toISOString().slice(11, 16)}`;
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
