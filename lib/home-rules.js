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
 *   fresh      [{ gameId, game, campaigns, creatives }]  what the developer has not opened yet in each game's Campaigns tab
 */
export function developerStrips({ games = [], fresh = [], quietFrom = 8 } = {}) {
  const items = [];
  for (const game of games) {
    if (game.quietDays != null && game.quietDays >= quietFrom) {
      items.push({ key: `quiet:${game.id}`, tone: "warn", icon: "plug", title: `${game.name} lost its connection`, text: `No signal from the SDK for ${game.quietDays} days · its ${plural(game.placements, "placement", "placements")} ${game.placements === 1 ? "is" : "are"} not updating`, action: "Open game", href: `/dashboard/g/${game.id}` });
    } else if (game.placements === 0) {
      items.push({ key: `empty:${game.id}`, tone: "warn", icon: "flag", title: `${game.name} has no placements yet`, text: "Press Send placements in Unity to report them.", action: "Open game", href: `/dashboard/g/${game.id}` });
    }
  }
  for (const item of fresh) {
    const parts = [];
    if (item.campaigns) parts.push(plural(item.campaigns, "new campaign", "new campaigns"));
    if (item.creatives) parts.push(plural(item.creatives, "new creative", "new creatives"));
    if (!parts.length) continue;
    items.push({
      key: `new:${item.gameId}`,
      tone: "sched",
      icon: "mega",
      title: `${parts.join(" and ")} in ${item.game}`,
      text: item.campaigns ? "You can pause or block them in the game's Campaigns tab." : "Added to campaigns that were already running. You can pause or block them in the game's Campaigns tab.",
      action: "Open campaigns",
      href: `/dashboard/g/${item.gameId}?tab=campaigns`,
    });
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

// ---- Recent activity: a burst of the same kind of notification becomes one row ----------------------------------------

const GAME_OF_LINK = /\/dashboard\/g\/([^/?#]+)/;

// Kinds that arrive in bursts, told apart by what the notification says (the table has no `type` column). Each knows how to
// say "n of them" and where the one row should lead. Anything else is grouped only when the text is exactly the same.
const BURSTS = [
  {
    key: "ads-live",
    test: /^(A new ad is showing in your game|New ads are showing in several of your games)/,
    // One game: its Campaigns tab. Several (or a link that names none): My games, where each game carries its own marker.
    where: (rows) => {
      const games = new Set();
      for (const row of rows) {
        const id = GAME_OF_LINK.exec(row.link ?? "")?.[1];
        if (!id) return { one: null };
        games.add(id);
      }
      return { one: games.size === 1 ? [...games][0] : null };
    },
    text: (count, one) => `${count} new ads are showing in ${one ? "your game" : "your games"}`,
    link: (one) => (one ? `/dashboard/g/${one}?tab=campaigns` : "/dashboard/games"),
  },
  {
    key: "ads-stopped",
    test: /^(The advertiser withdrew their booking on |An advertiser stopped a campaign that was showing in your game)/,
    where: () => ({ one: null }),
    text: (count) => `${count} ads were withdrawn or stopped in your games`,
    link: () => "/dashboard/games",
  },
];

/**
 * Collapses bursts in a person's notifications for Recent activity. `rows` is [{ id, text, link, created_at }].
 * Rows of the same kind belong together while each is within `gapMinutes` of the next one (a chain, so a long burst stays
 * one row). Returns [{ id, text, link, created_at, count }] newest first; `id`, `created_at` and a single row's text and link
 * are those of the newest row. Pure.
 */
export function groupActivity(rows, { gapMinutes = 10 } = {}) {
  const gap = gapMinutes * 60000;
  const at = (row) => Date.parse(row.created_at);
  const newestFirst = [...(rows ?? [])].sort((a, b) => (at(b) || 0) - (at(a) || 0));
  const open = new Map(); // kind or text -> the group still being filled
  const groups = [];
  for (const row of newestFirst) {
    const kind = BURSTS.find((item) => item.test.test(row.text ?? "")) ?? null;
    const key = kind ? kind.key : `text:${row.text}`;
    const group = open.get(key);
    if (group && Number.isFinite(at(row)) && group.oldest - at(row) <= gap) {
      group.rows.push(row);
      group.oldest = at(row);
    } else {
      const fresh = { kind, rows: [row], oldest: at(row) };
      open.set(key, fresh);
      groups.push(fresh);
    }
  }
  return groups.map(({ kind, rows: list }) => {
    const newest = list[0];
    const base = { id: newest.id, created_at: newest.created_at, count: list.length };
    if (list.length === 1) return { ...base, text: newest.text, link: newest.link ?? null };
    if (!kind) return { ...base, text: `${newest.text} ×${list.length}`, link: newest.link ?? null };
    const { one } = kind.where(list);
    return { ...base, text: kind.text(list.length, one), link: kind.link(one) };
  });
}
