// The Users screen: rows for the table and the figures for its widgets. Pure, so test/admin-users.test.mjs can run it.
import { countBy, weekly, ring, bars, stats, cols, note, RED, ORANGE, GREEN, BLUE, GREY, AMBER } from "./admin-stats.js";

const DAY = 864e5;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** What an account is doing now, in a few words ("3 games", "2 campaigns", "No games"). */
export function doingNow({ role, games, campaigns, active }) {
  if (role === "admin") return "Platform admin";
  if (role === "developer") return games ? plural(games, "game", "games") : "No games";
  if (campaigns) return active ? plural(campaigns, "campaign", "campaigns") : `${plural(campaigns, "campaign", "campaigns")}, none running`;
  return "No campaigns";
}

/**
 * Table rows from raw accounts. `gamesOf` / `campaignsOf` map account id → count, `active` is a Set of ids.
 * Sorting and filtering happen in the browser.
 */
export function userRows({ accounts, gamesOf, campaignsOf, active, selfId, now = Date.now() }) {
  return accounts.map((a) => {
    const games = gamesOf.get(a.id) ?? 0;
    const campaigns = campaignsOf.get(a.id) ?? 0;
    const isActive = active.has(a.id);
    return {
      id: a.id,
      company: a.company ?? "",
      email: a.email ?? "",
      role: a.role,
      joined: String(a.created_at).slice(0, 10),
      age: Math.max(0, Math.floor((now - Date.parse(a.created_at)) / DAY)),
      active: isActive,
      suspended: Boolean(a.suspended_at),
      games,
      campaigns,
      doing: doingNow({ role: a.role, games, campaigns, active: isActive }),
      avatarUrl: a.avatarUrl ?? null,
      self: a.id === selfId,
    };
  });
}

export const USER_GROUPS = [["a", "Accounts"], ["g", "Activity"]];
export const USER_DEFAULTS = ["uroles", "ustatus", "usign", "unew", "uidle"];

/** The widgets of the Users board, with their figures. */
export function userWidgets(rows) {
  const dev = rows.filter((r) => r.role === "developer");
  const adv = rows.filter((r) => r.role === "advertiser");
  const idle = rows.filter((r) => r.role !== "admin" && !r.active && !r.suspended && (r.role === "developer" ? r.games === 0 : r.campaigns === 0));
  const unnamed = rows.filter((r) => !r.company).length;
  return [
    { k: "uroles", g: "a", t: "Accounts by role", w: 4, info: "Developers, advertisers and admins on the platform.", data: ring([["Developers", dev.length, BLUE], ["Advertisers", adv.length, ORANGE], ["Admins", rows.filter((r) => r.role === "admin").length, GREY]], "accounts") },
    { k: "ustatus", g: "a", t: "Active and inactive", w: 4, info: "Active means a game or a campaign is running now. Switched off accounts were disabled by an admin.", data: ring([["Active", rows.filter((r) => r.active && !r.suspended).length, GREEN], ["Inactive", rows.filter((r) => !r.active && !r.suspended).length, GREY], ["Switched off", rows.filter((r) => r.suspended).length, AMBER]], "accounts") },
    { k: "usign", g: "a", t: "New accounts per week", w: 8, info: "Accounts created in each of the last 13 weeks.", data: cols(weekly(rows, (r) => r.age)) },
    { k: "unew", g: "a", t: "Joined recently", w: 4, info: "Accounts created in the last 7 and 30 days, and the total.", data: stats([["7 days", rows.filter((r) => r.age <= 7).length], ["30 days", rows.filter((r) => r.age <= 30).length], ["All", rows.length]]) },
    { k: "uidle", g: "g", t: "Signed up, never started", w: 6, info: "Accounts with no game (developers) or no campaign (advertisers) yet. Candidates for a reminder.", data: bars([["Developers without a game", idle.filter((r) => r.role === "developer").length], ["Advertisers without a campaign", idle.filter((r) => r.role === "advertiser").length]], AMBER) },
    { k: "ugames", g: "g", t: "Developers by games", w: 6, info: "How many games each developer has added.", data: bars([["No games", dev.filter((r) => r.games === 0).length], ["1 game", dev.filter((r) => r.games === 1).length], ["2 to 3 games", dev.filter((r) => r.games >= 2 && r.games <= 3).length], ["4 or more", dev.filter((r) => r.games >= 4).length]], BLUE) },
    { k: "ucamp", g: "g", t: "Advertisers by campaigns", w: 6, info: "How many campaigns each advertiser has.", data: bars([["No campaigns", adv.filter((r) => r.campaigns === 0).length], ["1 campaign", adv.filter((r) => r.campaigns === 1).length], ["2 or more", adv.filter((r) => r.campaigns >= 2).length]], ORANGE) },
    { k: "ucomp", g: "g", t: "Missing company name", w: 4, info: "Accounts that have not filled in a company name. It is shown to the other side.", data: stats([["Without a name", unnamed], ["Share", `${Math.round((unnamed / Math.max(rows.length, 1)) * 100)}%`]]) },
  ];
}

/** Role order for sorting: admin, developer, advertiser. */
export const ROLE_RANK = { admin: 0, developer: 1, advertiser: 2 };
export const userSortValue = (row, key) => {
  if (key === "status") return row.suspended ? 2 : row.active ? 0 : 1;
  if (key === "role") return ROLE_RANK[row.role] ?? 3;
  if (key === "joined") return row.joined;
  if (key === "doing") return row.doing;
  if (key === "company") return row.company;
  return row[key];
};
