// The one set of menu pictograms (SVG paths on a 24px grid). The sidebar and the window headers both read it,
// so a window shows the same icon as its menu entry.
export const NAV_ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  overview: "M3 11l9-8 9 8M5 10v10h14V10",
  games: "M3 7h18v11H3zM8 11v3M6.5 12.5h3",
  requests: "M4 4h16v12H8l-4 4z",
  creatives: "M3 4h18v16H3zM3 9h18M8 14h8",
  find: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  campaigns: "M4 6h16M4 12h16M4 18h10",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  modCreatives: "M5 12.5l4.5 4.5L19 7.5",
  applications: "M9 4a4 4 0 100 8 4 4 0 000-8zM2 21c1-6 14-6 15 0",
  disputes: "M5 21V4m0 0h11l-2 4 2 4H5",
  bookings: "M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 10h16M9 3v4m6-4v4",
  users: "M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .6 3.3 2.3 3.5 5.2",
  traffic: "M3 12h4l2.5-6 4 12 2.5-6H21",
  support: "M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z",
  system: "M4.5 6a7.5 3 0 1 0 15 0 7.5 3 0 1 0-15 0zM4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3",
};
// Account has no menu entry (it opens from the account menu), so it has its own.
NAV_ICONS.account = "M12 11a4 4 0 100-8 4 4 0 000 8zM4 21c.6-4 3.8-6 8-6s7.4 2 8 6";
