// The dashboard menu for each role. Pure data, so the structure can be tested:
// the layout only renders what menuFor() returns.

export const ROLE_LABEL = { developer: "Developer", advertiser: "Advertiser", admin: "Admin" };

/**
 * Menu groups for a role. `badges` holds counts keyed by item key (inbox, system;
 * `inbox` is the number of creatives waiting for review). Notifications are not a menu entry:
 * they live behind the bell in the top corner.
 * A group with `foot: true` sits at the bottom of the menu.
 * Items: { key, label, href, exact?, badge?, children?, also? }. `children` are shown under the
 * item while it is current; `also` are further path prefixes that count as being inside the item
 * (a game's own pages belong to "My games").
 */
// Pages that belong to Campaigns without being its list: a campaign, the new-campaign flow, and the creative
// pages (the Creatives tab is part of the Campaigns window, and a creative opens over it).
const CAMPAIGN_PAGES = ["/dashboard/advertising/c/", "/dashboard/advertising/new", "/dashboard/creatives"];

// The Home page of developers and advertisers; its guides and the news list live below it.
export const HOME_PAGE = "/dashboard/home";

export function menuFor(role, badges = {}, games = []) {
  const item = (key, label, href, extra = {}) => ({ key, label, href, badge: badges[key] || 0, ...extra });
  const myGames = () => item("games", "My games", "/dashboard/games", { children: games, also: ["/dashboard/g/"] });

  // Help & feedback sits at the foot of the menu for the people who write to the admin (an admin answers instead).
  const help = { heading: null, foot: true, items: [item("support", "Help & feedback", "/dashboard/support")] };

  const developer = [
    {
      heading: null,
      items: [
        item("home", "Home", HOME_PAGE),
        myGames(),
      ],
    },
    help,
  ];

  const advertiser = [
    {
      heading: null,
      items: [
        // Home is the starting page (what needs attention, guides, news); the Overview holds the numbers. Creatives and
        // placements are not menu entries: Creatives is a tab of the Campaigns window, and placements are picked while
        // creating a campaign and on the campaign's page.
        item("home", "Home", HOME_PAGE),
        item("overview", "Overview", "/dashboard", { exact: true }),
        item("campaigns", "Campaigns", "/dashboard/advertising", { exact: true, also: CAMPAIGN_PAGES }),
      ],
    },
    help,
  ];

  // An admin can use every part of the platform with the one account, to try the whole path without
  // creating more users: their own tools first, then everything an advertiser has, then everything a
  // developer has. (An admin may also book placements in their own games.)
  const admin = [
    {
      heading: "Moderation",
      items: [
        // One place for everything waiting on an admin: new creatives, format images, what was reviewed.
        item("modCreatives", "Review creatives", "/dashboard/admin", { exact: true, badge: badges.inbox || 0 }),
        item("disputes", "Disputes", "/dashboard/admin/disputes"),
        // Messages from developers and advertisers; the badge counts the ones waiting for an answer.
        item("support", "Support", "/dashboard/admin/support"),
      ],
    },
    {
      heading: "Platform",
      items: [
        item("bookings", "All bookings", "/dashboard/admin/bookings"),
        item("users", "Users", "/dashboard/admin/users"),
        item("traffic", "Traffic", "/dashboard/admin/traffic"),
        item("system", "System", "/dashboard/admin/system"),
      ],
    },
    {
      heading: "As an advertiser",
      items: [
        // An advertiser's Overview is their Home; an admin's Home is the review page, so the Overview gets its own entry.
        item("overview", "Overview", "/dashboard/advertising/overview", { exact: true }),
        item("campaigns", "Campaigns", "/dashboard/advertising", { exact: true, also: CAMPAIGN_PAGES }),
      ],
    },
    {
      heading: "As a developer",
      items: [myGames()],
    },
  ];

  const groups = role === "admin" ? admin : role === "advertiser" ? advertiser : developer;
  return groups;
}

/** Where a role lands after signing in and where the logo leads: the Home page for a developer, the Overview for an advertiser. */
export function homeFor(role) {
  return role === "admin" ? "/dashboard/admin" : role === "developer" ? HOME_PAGE : "/dashboard";
}

/** Is this menu item the current page? */
export function isActive(item, pathname) {
  if (item.also?.some((prefix) => pathname.startsWith(prefix))) return true;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
