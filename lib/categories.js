// The fixed list of ad categories (same ids as the ad_categories table, migration 0015).
export const AD_CATEGORIES = [
  { id: "games_apps", label: "Games and apps", restricted: false },
  { id: "entertainment", label: "Entertainment and media", restricted: false },
  { id: "food_drink", label: "Food and drink", restricted: false },
  { id: "retail", label: "Retail and e-commerce", restricted: false },
  { id: "tech", label: "Tech and hardware", restricted: false },
  { id: "finance", label: "Finance and crypto", restricted: false },
  { id: "health_fitness", label: "Health and fitness", restricted: false },
  { id: "education", label: "Education", restricted: false },
  { id: "travel", label: "Travel", restricted: false },
  { id: "auto", label: "Automotive", restricted: false },
  { id: "alcohol_tobacco", label: "Alcohol and tobacco", restricted: true },
  { id: "gambling", label: "Gambling and betting", restricted: true },
  { id: "dating_adult", label: "Dating and adult", restricted: true },
  { id: "other", label: "Other", restricted: false },
];

const BY_ID = new Map(AD_CATEGORIES.map((category) => [category.id, category]));

export function isCategory(id) {
  return BY_ID.has(id);
}

export function categoryLabel(id) {
  return BY_ID.get(id)?.label ?? "Other";
}
