import { AD_CATEGORIES } from "./categories.js";

// Order of the campaigns list when the Campaign column is sorted: by the ad category written under each name
// (in the order of the fixed category list, not alphabetically), and by name inside a category.

const RANK = new Map(AD_CATEGORIES.map((category, index) => [category.id, index]));
const OTHER = RANK.get("other");

/** Place of an ad category in the fixed list. A campaign without a category yet gets Infinity: after all of them. */
export function categoryRank(id) {
  if (!id) return Number.POSITIVE_INFINITY;
  return RANK.has(id) ? RANK.get(id) : OTHER; // an unknown id is shown as "Other"
}

/**
 * Sorts campaigns { name, category } by category, then name. `dir` "asc" follows the category list, "desc" reverses it.
 * Campaigns without a category stay last either way. Returns a new array.
 */
export function sortByCategory(campaigns, dir = "asc") {
  const sign = dir === "desc" ? -1 : 1;
  return [...campaigns].sort((a, b) => {
    const left = categoryRank(a.category);
    const right = categoryRank(b.category);
    if (left === Number.POSITIVE_INFINITY && right !== Number.POSITIVE_INFINITY) return 1;
    if (right === Number.POSITIVE_INFINITY && left !== Number.POSITIVE_INFINITY) return -1;
    if (left !== right) return (left - right) * sign;
    return String(a.name ?? "").localeCompare(String(b.name ?? "")) * sign;
  });
}

// The status filter of the campaigns list groups the statuses of lib/advertiser-overview.js into five choices.
export const STATUS_GROUPS = [
  ["all", "All"],
  ["live", "Live"],
  ["paused", "Paused"],
  ["upcoming", "Upcoming"],
  ["draft", "Draft"],
  ["ended", "Ended"],
];
const GROUP_OF = { live: "live", limited: "live", stopped: "live", paused: "paused", scheduled: "upcoming", waiting: "upcoming", draft: "draft", ended: "ended" };

/** The filter group of a campaign { status: { key } }. */
export function campaignGroup(campaign) {
  return GROUP_OF[campaign?.status?.key] ?? "draft";
}

/** Keeps the campaigns whose name contains `query` (any case) and that are in the status group `group` ("all" keeps every status). */
export function filterCampaigns(campaigns, { query = "", group = "all" } = {}) {
  const needle = String(query).trim().toLowerCase();
  return campaigns.filter((c) => (!needle || String(c.name ?? "").toLowerCase().includes(needle)) && (group === "all" || campaignGroup(c) === group));
}
