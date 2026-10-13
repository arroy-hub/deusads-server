// The picture of each ad category, shared by the developer's Campaigns tab and the advertiser's lists.

export const ICON_PATHS = {
  games_apps: "M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 00-3.9 3.2L2 15a3 3 0 005.3 2l1.2-2h7l1.2 2A3 3 0 0022 15l-.8-6.8A4 4 0 0017.3 5z",
  entertainment: "M12 21a9 9 0 100-18 9 9 0 000 18zM10 8.5l5 3.5-5 3.5z",
  food_drink: "M5 8h12v6a5 5 0 01-5 5H10a5 5 0 01-5-5V8zM17 10h2a2 2 0 010 4h-2M8 3v2M12 3v2",
  retail: "M5 8h14l-1 12H6L5 8zM9 8a3 3 0 016 0",
  tech: "M4 5h16v11H4zM9 20h6M12 16v4",
  finance: "M12 21a9 9 0 100-18 9 9 0 000 18zM14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5",
  health_fitness: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  education: "M2 9l10-5 10 5-10 5-10-5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5",
  travel: "M21 3L3 10l7 3 3 7 8-17z",
  auto: "M5 16V11l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3M7 13h.01M17 13h.01",
  alcohol_tobacco: "M7 3h10l-1 7a4 4 0 01-8 0L7 3zM12 14v7M8 21h8",
  gambling: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01",
  dating_adult: "M21 12a8 8 0 01-11.5 7.2L3 21l1.8-5.5A8 8 0 1121 12z",
  other: "M5 12h.01M12 12h.01M19 12h.01",
};

/** A style object that paints a category's glyph (a mask over the element's colour). */
export function iconStyle(category) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[category] ?? ICON_PATHS.other}"/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { WebkitMaskImage: url, maskImage: url };
}
