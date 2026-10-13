const PATHS = {
  games_apps: "M6 9h12a4 4 0 014 4v2a3 3 0 01-5 2l-1-1H8l-1 1a3 3 0 01-5-2v-2a4 4 0 014-4zM8 12v3M6.5 13.5h3",
  entertainment: "M4 5h16v14H4zM10 9l5 3-5 3z",
  food_drink: "M6 3h12l-1.5 17h-9zM6.5 8h11",
  retail: "M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2",
  tech: "M4 5h16v11H4zM9 20h6M12 16v4",
  finance: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.7 2.5 1.8-1 1.4-2.5 1.7-2.5.7-2.5 1.8 1 1.7 2.5 1.7 2.5-.5 2.5-1.5",
  health_fitness: "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z",
  education: "M3 9l9-5 9 5-9 5zM7 12v5c2 2 8 2 10 0v-5",
  travel: "M2 14l20-8-6 14-4-6zM12 14l-1 5",
  auto: "M3 16h18v2H3zM3 16c0-4 2-6 5-6l3 2 5 1c3 .5 5 1.5 5 3",
  alcohol_tobacco: "M7 3h10l-1 8a4 4 0 01-8 0zM12 15v6M9 21h6",
  gambling: "M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  dating_adult: "M12 21l-8-8a5 5 0 017-7l1 1 1-1a5 5 0 017 7z",
  other: "M4 6h16v12H4z",
};

const TONES = {
  warm: ["#f7e6e0", "#8a2c17"],
  cool: ["#e0eaf3", "#1f4768"],
  plain: ["#ebe8e3", "#4b4843"],
  none: ["#f3f2f0", "#6b665f"],
};
const TONE_OF = { auto: "warm", food_drink: "warm", retail: "warm", health_fitness: "warm", games_apps: "cool", tech: "cool", education: "cool", entertainment: "plain" };

/** A small tile with the picture of an ad category (a campaign's creatives say what is advertised). Empty category: a neutral tile. */
export default function CategoryIcon({ category, label }) {
  const [bg, fg] = TONES[category ? TONE_OF[category] ?? "plain" : "none"];
  return (
    <span className="cl-icon" style={{ background: bg, color: fg }} role="img" aria-label={label || "Category"}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={PATHS[category] ?? PATHS.other} />
      </svg>
    </span>
  );
}
