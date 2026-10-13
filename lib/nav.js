// The dashboard menu for each role. Pure data, so the structure can be tested:
// the layout only renders what menuFor() returns.

export const ROLE_LABEL = { developer: "Developer", advertiser: "Advertiser", admin: "Admin" };

/**
 * Menu groups for a role. `badges` holds counts keyed by item key (inbox, system;
 * `inbox` is the number of creatives waiting for review). Notifications are not a menu entry:
 * they live behind the bell in the top corner.
 * Items: { key, label, href, exact?, badge?, children?, also? }. `children` are shown under the
 * item while it is current; `also` are further path prefixes that count as being inside the item
 * (a game's own pages belong to "My games").
 */
export function menuFor(role, badges = {}, games = []) {
  const item = (key, label, href, extra = {}) => ({ key, label, href, badge: badges[key] || 0, ...extra });
  const myGames = () => item("games", "My games", "/dashboard/games", { children: games, also: ["/dashboard/g/"] });

  const developer = [
    {
      heading: null,
      items: [
        item("home", "Home", "/dashboard", { exact: true }),
        myGames(),
      ],
    },
  ];

  const advertiser = [
    {
      heading: null,
      items: [
        item("home", "Home", "/dashboard", { exact: true }),
        item("creatives", "Creatives", "/dashboard/creatives"),
        item("find", "Find placements", "/dashboard/advertising/new"),
        item("campaigns", "Campaigns", "/dashboard/advertising", { exact: true, also: ["/dashboard/advertising/c/"] }),
        item("reports", "Reports", "/dashboard/advertising/reports"),
      ],
    },
  ];

  // An admin can use every part of the platform with the one account, to try the whole path without
  // creating more users: their own tools first, then everything an advertiser has, then everything a
  // developer has. (An admin may also book placements in their own games.)
  const admin = [
    {
      heading: "Admin",
      items: [
        // One place for everything waiting on an admin: new creatives, format images, what was reviewed.
        item("modCreatives", "Review creatives", "/dashboard/admin", { exact: true, badge: badges.inbox || 0 }),
        item("disputes", "Disputes", "/dashboard/admin/disputes"),
        item("bookings", "All bookings", "/dashboard/admin/bookings"),
        item("users", "Users", "/dashboard/admin/users"),
        item("system", "System", "/dashboard/admin/system"),
      ],
    },
    {
      heading: "As an advertiser",
      items: [
        // An advertiser's Overview is their Home; an admin's Home is the review page, so the Overview gets its own entry.
        item("overview", "Overview", "/dashboard/advertising/overview", { exact: true }),
        item("creatives", "Creatives", "/dashboard/creatives"),
        item("find", "Find placements", "/dashboard/advertising/new"),
        item("campaigns", "Campaigns", "/dashboard/advertising", { exact: true, also: ["/dashboard/advertising/c/"] }),
        item("reports", "Reports", "/dashboard/advertising/reports"),
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

/** Where "Home" is for a role. */
export function homeFor(role) {
  return role === "admin" ? "/dashboard/admin" : "/dashboard";
}

/** Is this menu item the current page? */
export function isActive(item, pathname) {
  if (item.also?.some((prefix) => pathname.startsWith(prefix))) return true;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
