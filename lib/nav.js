// The dashboard menu for each role. Pure data, so the structure can be tested:
// the layout only renders what menuFor() returns.

export const ROLE_LABEL = { developer: "Developer", advertiser: "Advertiser", admin: "Admin" };

/**
 * Menu groups for a role. `badges` holds counts keyed by item key
 * (requests, notifications, inbox, system).
 * Items: { key, label, href, exact?, badge? }.
 */
export function menuFor(role, badges = {}, games = []) {
  const item = (key, label, href, extra = {}) => ({ key, label, href, badge: badges[key] || 0, ...extra });
  const notifications = item("notifications", "Notifications", "/dashboard/notifications");

  const developer = [
    {
      heading: null,
      items: [
        item("home", "Home", "/dashboard", { exact: true }),
        item("games", "My games", "/dashboard/games", { children: games }),
        item("requests", "Ad requests", "/dashboard/requests"),
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
        item("campaigns", "Campaigns", "/dashboard/advertising", { exact: true }),
        item("reports", "Reports", "/dashboard/advertising/reports"),
      ],
    },
  ];

  const admin = [
    {
      heading: null,
      items: [
        item("inbox", "Inbox", "/dashboard/admin/inbox"),
        item("bookings", "All bookings", "/dashboard/admin/bookings"),
        item("users", "People", "/dashboard/admin/users"),
        item("system", "System", "/dashboard/admin/system"),
      ],
    },
    {
      heading: "My own",
      items: [
        item("games", "My games", "/dashboard/games", { children: games }),
        item("requests", "Ad requests", "/dashboard/requests"),
        item("creatives", "Creatives", "/dashboard/creatives"),
        item("campaigns", "Campaigns", "/dashboard/advertising"),
        item("reports", "Reports", "/dashboard/advertising/reports"),
      ],
    },
  ];

  const groups = role === "admin" ? admin : role === "advertiser" ? advertiser : developer;
  return [...groups, { heading: null, items: [notifications] }];
}

/** Where "Home" is for a role. */
export function homeFor(role) {
  return role === "admin" ? "/dashboard/admin/inbox" : "/dashboard";
}

/** Is this menu item the current page? */
export function isActive(item, pathname) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
