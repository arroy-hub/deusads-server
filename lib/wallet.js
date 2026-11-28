// The virtual wallet (migration 0061): the price of an impression, who gets what, a campaign's budget and how the
// figures are written. Pure: no database and no React, so the rules can be tested (test/wallet.test.mjs).
//
// Credits are demo units for the pilot. One price for everybody, set by the platform: RATE credits per 1,000
// impressions. The developer of the game gets DEV_SHARE of what the advertiser paid, DeusADS keeps the rest.
// The database stores what the advertiser paid; the shares are worked out here.

export const RATE = 6; // credits per 1,000 impressions
export const PRICE = RATE / 1000; // one impression
export const DEV_SHARE = 0.8;
export const PLATFORM_SHARE = 0.2;
export const MAX_TOPUP = 1_000_000;
/** The file to run when the wallet's tables and functions are missing. */
export const WALLET_MIGRATION = "0061_wallet.sql";

export const TEST_NOTE = "Credits are demo units for the pilot. No real money is charged or paid out.";
/** The same explanation for the person who pays and the person who earns: only the verb differs. */
export const creditNote = (verb) =>
  `1 C. stands for 1 US dollar. Credits use the same figures you will later ${verb} in dollars, at the rate planned for launch. We call them credits for now so that pilot numbers are not mistaken for real money.`;

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor + Number.EPSILON) / factor;
};
/** Whole cents. */
export const round2 = (value) => round(value, 2);

/** "1,234.50": an amount of credits, always with two decimals. The "C." beside it is written by the caller. */
export function credits(value) {
  return round2(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "12,345": a count. */
export const count = (value) => Math.round(Number(value) || 0).toLocaleString("en-US");

/** What an advertiser pays for this many impressions. */
export const costOf = (impressions) => (Number(impressions) || 0) * PRICE;
/** What the developer earns from this many paid impressions. */
export const earnedOf = (impressions) => costOf(impressions) * DEV_SHARE;
/** The developer's part of an amount advertisers paid. */
export const developerPart = (amount) => (Number(amount) || 0) * DEV_SHARE;
/** The platform's part of an amount advertisers paid: what is left after the developers' part, to the cent. */
export const platformPart = (amount) => round2(amount) - round2(developerPart(amount));
/** How many impressions an amount pays for. */
export const impressionsFor = (amount) => Math.max(0, Math.floor((Number(amount) || 0) / PRICE + 1e-9));

/** An amount typed by a person: "1 000,50" -> 1000.5. NaN when it is not a number. */
export function parseAmount(text) {
  const value = Number.parseFloat(String(text ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? round2(value) : Number.NaN;
}

/**
 * Where a campaign's budget stands. `row` has the columns of migration 0061 (budget, budget_spent, budget_closed_at,
 * budget_returned); a row without them is a campaign with no limit.
 *   unlimited  runs without a limit and takes nothing from the wallet
 *   closed     the campaign is over and what was left went back to the wallet (`returned`)
 *   out        the budget cannot pay for one more impression: the campaign is not shown until budget is added
 *   left       what can still be spent (0 when closed)        pct  share of the budget used, 0 to 100
 */
export function budgetOf(row) {
  const spent = Number(row?.budget_spent ?? 0) || 0;
  if (row?.budget == null) return { unlimited: true, budget: null, spent, left: null, pct: 0, out: false, closed: false, returned: 0 };
  const budget = Number(row.budget) || 0;
  const closed = Boolean(row.budget_closed_at);
  const left = closed ? 0 : Math.max(0, budget - spent);
  return {
    unlimited: false,
    budget,
    spent,
    left,
    pct: budget > 0 ? Math.min(100, (spent / budget) * 100) : 100,
    out: !closed && budget - spent < PRICE - 1e-9,
    closed,
    returned: Number(row.budget_returned ?? 0) || 0,
  };
}

/** May a campaign with this budget row be shown now? (The manifest's rule.) */
export function hasBudget(row) {
  const state = budgetOf(row);
  return state.unlimited || (!state.closed && !state.out);
}

/** The colour of a budget bar: amber when used up, red when nearly, green otherwise. */
/** From this share of a budget used (percent) a campaign is "running low": the advertiser is told, and Home says so. */
export const LOW_BUDGET = 85;

/**
 * The budgets worth a look, from an advertiser's campaigns: [{ id, name, status, budget }] (status is the key of
 * campaignStatus, budget is what budgetOf gives).
 *   total / running  campaigns on a budget that have not ended, and how many of them still have budget
 *   out              those whose budget is used up          low   live ones that have used LOW_BUDGET percent or more
 *   reserved         what is still set aside in budgets
 */
export function budgetWatch(campaigns) {
  const list = (campaigns ?? []).filter((campaign) => campaign.budget && !campaign.budget.unlimited);
  const counted = list.filter((campaign) => !campaign.budget.closed && campaign.status !== "ended" && campaign.status !== "draft");
  const out = counted.filter((campaign) => campaign.budget.out);
  const low = counted.filter((campaign) => !campaign.budget.out && (campaign.status === "live" || campaign.status === "limited") && campaign.budget.pct >= LOW_BUDGET);
  return { total: counted.length, running: counted.length - out.length, out, low, reserved: list.reduce((sum, campaign) => sum + (campaign.budget.left ?? 0), 0) };
}

export function budgetTone(state) {
  return state.out ? "#b7791f" : state.pct > 85 ? "#c94a24" : "#2e7d4f";
}

/** "about 12 days", from what is left and what the last seven full days spent. Null when it cannot be told. */
export function lastsAbout(left, weekSpend) {
  const perDay = (Number(weekSpend) || 0) / 7;
  if (!(perDay > 0) || !(left > 0)) return null;
  const days = left / perDay;
  if (days < 1) return "less than a day";
  const whole = Math.round(days);
  return `${whole} ${whole === 1 ? "day" : "days"}`;
}

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The last `days` UTC days ending today, oldest first: ["2026-11-01", ...]. */
export function lastDays(days, now = Date.now()) {
  const today = Date.parse(iso(now));
  return Array.from({ length: days }, (_, index) => iso(today - (days - 1 - index) * DAY));
}

/** "23 Nov". */
export function dayText(isoDay) {
  const [, month, day] = String(isoDay).slice(0, 10).split("-").map(Number);
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? ""}`;
}

/** "Mon, 23 Nov". */
export function weekdayText(isoDay) {
  const date = new Date(`${String(isoDay).slice(0, 10)}T00:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()]}, ${dayText(isoDay)}`;
}

/**
 * One entry per day: { day, impressions, value }. `rows` are [{ day, impressions }] (several rows of a day are added
 * up); `share` turns paid impressions into credits (1 for the advertiser, DEV_SHARE for the developer...).
 */
export function daySeries(days, rows, share = 1) {
  const sum = new Map();
  for (const row of rows ?? []) {
    const key = String(row.day).slice(0, 10);
    sum.set(key, (sum.get(key) ?? 0) + (Number(row.impressions) || 0));
  }
  return days.map((day) => ({ day, impressions: sum.get(day) ?? 0, value: costOf(sum.get(day) ?? 0) * share }));
}

/** The top of a money axis: a round number at or above the peak whose quarters are round too (1, 2, 4, 6, 8 times a power of ten). */
export function moneyTop(peak) {
  if (!(peak > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(peak));
  return [1, 2, 4, 6, 8, 10].map((step) => step * power).find((value) => value >= peak - 1e-12);
}

/** An axis label for credits: whole numbers from 100 up, else up to two decimals. */
export const tickText = (value) => (value >= 100 ? count(value) : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 }));

// ---------------------------------------------------------------------------------------------------------------------
// Paid impressions of a game, cut the way the Performance tab cuts views (lib/performance-view.js): a scope is the
// whole game ({ all: true }) or a list of members { placement, place?, unplaced? }.

/** An index of the rows of wallet_game().places: [{ day, placement_id, place_id, impressions }]. */
export function paidIndex(rows) {
  const total = { all: 0, days: new Map() };
  const byPlacement = new Map();
  for (const row of rows ?? []) {
    const n = Number(row.impressions) || 0;
    if (!n) continue;
    const day = String(row.day).slice(0, 10);
    total.all += n;
    total.days.set(day, (total.days.get(day) ?? 0) + n);
    if (!byPlacement.has(row.placement_id)) byPlacement.set(row.placement_id, { all: 0, days: new Map(), places: new Map() });
    const entry = byPlacement.get(row.placement_id);
    entry.all += n;
    entry.days.set(day, (entry.days.get(day) ?? 0) + n);
    const placeKey = row.place_id ?? "";
    if (!entry.places.has(placeKey)) entry.places.set(placeKey, { all: 0, days: new Map() });
    const place = entry.places.get(placeKey);
    place.all += n;
    place.days.set(day, (place.days.get(day) ?? 0) + n);
  }
  return { total, byPlacement };
}

function partsOf(scope, index) {
  if (!scope || !index) return [];
  if (scope.all) return [index.total];
  const parts = [];
  for (const member of scope.members ?? []) {
    const entry = index.byPlacement.get(member.placement);
    if (!entry) continue;
    if (member.place) parts.push(entry.places.get(member.place));
    else if (member.unplaced) parts.push(entry.places.get(""));
    else parts.push(entry);
  }
  return parts.filter(Boolean);
}

/** Paid impressions of a scope in the whole window. */
export function paidOf(scope, index) {
  return partsOf(scope, index).reduce((sum, part) => sum + part.all, 0);
}

/** Paid impressions of a scope on each of `days` (ISO days). */
export function paidByDay(scope, index, days) {
  const parts = partsOf(scope, index);
  return days.map((day) => parts.reduce((sum, part) => sum + (part.days.get(day) ?? 0), 0));
}

/** Impressions the empty slots would have had, had each been seen as often as a filled one. */
export function missedImpressions({ adv = 0, own = 0, filled = 0, empty = 0 }) {
  return filled > 0 ? Math.round(((adv + own) * empty) / filled) : 0;
}

/**
 * Paid impressions of a scope per campaign, most first. `rows` are the campaigns of wallet_game() with their names:
 * [{ id, name, advertiser, placement_id, place_id, impressions }].
 */
export function paidCampaigns(scope, rows) {
  if (!scope) return [];
  const whole = new Set();
  const places = new Set();
  const unplaced = new Set();
  for (const member of scope.members ?? []) {
    if (member.place) places.add(`${member.placement}|${member.place}`);
    else if (member.unplaced) unplaced.add(member.placement);
    else whole.add(member.placement);
  }
  const inScope = (row) =>
    scope.all || whole.has(row.placement_id) || (row.place_id ? places.has(`${row.placement_id}|${row.place_id}`) : unplaced.has(row.placement_id));
  const byId = new Map();
  for (const row of rows ?? []) {
    const n = Number(row.impressions) || 0;
    if (!n || !inScope(row)) continue;
    const entry = byId.get(row.id) ?? { id: row.id, name: row.name, advertiser: row.advertiser, impressions: 0 };
    entry.impressions += n;
    byId.set(row.id, entry);
  }
  return [...byId.values()].sort((a, b) => b.impressions - a.impressions || String(a.name).localeCompare(String(b.name)));
}

/** Lists of { label, impressions } added up by label, most first (campaigns or place types of several games). */
export function mergePaid(lists, keyOf = (row) => row.label) {
  const merged = new Map();
  for (const row of (lists ?? []).flat()) {
    const key = keyOf(row);
    const entry = merged.get(key);
    if (entry) entry.impressions += Number(row.impressions) || 0;
    else merged.set(key, { ...row, impressions: Number(row.impressions) || 0 });
  }
  return [...merged.values()].filter((row) => row.impressions > 0).sort((a, b) => b.impressions - a.impressions);
}

/**
 * What a selection could have earned (the Potential line of the Earned block). All in the developer's credits.
 *   paid   paid impressions          adv   all impressions of advertisers' creatives
 *   own    the developer's own creatives          filled / empty   slots that got something to show, and that got nothing
 * An empty slot is counted as if it had been seen as often as a filled one. Advertisers' impressions that were not
 * paid (shown after a budget ran out, or by a campaign that no longer exists) are `other`.
 */
export function potentialOf({ paid = 0, adv = 0, own = 0, filled = 0, empty = 0, missed = null }) {
  const emptyImpressions = missed == null ? missedImpressions({ adv, own, filled, empty }) : Math.max(0, Math.round(missed));
  const otherImpressions = Math.max(0, adv - paid);
  const parts = { earned: earnedOf(paid), own: earnedOf(own), empty: earnedOf(emptyImpressions), other: earnedOf(otherImpressions) };
  const full = parts.earned + parts.own + parts.empty + parts.other;
  return { ...parts, full, emptyImpressions, otherImpressions, share: full > 0 ? (parts.earned / full) * 100 : 0 };
}

// ---------------------------------------------------------------------------------------------------------------------

/** Is this database error "the wallet's migration is not applied"? */
export function walletMissing(error) {
  if (!error) return false;
  return ["PGRST202", "PGRST204", "PGRST205", "42883", "42703", "42P01"].includes(error.code);
}

/** What to tell a person when adding credits or budget was refused: `result` is what the database function answered. */
export function walletError(result) {
  switch (result?.error) {
    case "amount":
      return "Type an amount above zero.";
    case "too_much":
      return `That is more than one top-up can add (${count(MAX_TOPUP)} credits).`;
    case "funds":
      return `Your wallet has ${credits(result.available ?? 0)} C. Add credits first or type a smaller amount.`;
    case "no_limit":
      return "This campaign runs without a limit, so it has no budget to add to.";
    case "campaign":
      return "Unknown campaign.";
    default:
      return "";
  }
}


// Payouts to developers: once a month, on the 1st, when the balance has reached the minimum. (During the pilot credits
// are demo units and nothing is paid; the wallet shows where a developer would stand.)
export const PAYOUT_MINIMUM = 50;
export const PAYOUT_DAY = 1;

/**
 * Where a developer stands for the next payout: { minimum, reached, left, pct, next } with `next` the ISO day of the
 * coming payout day (today when today is that day). `balance` is in credits.
 */
export function payoutPlan(balance, now = Date.now()) {
  const amount = Math.max(0, Number(balance) || 0);
  const today = new Date(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const onTheDay = today.getUTCDate() === PAYOUT_DAY;
  const next = new Date(Date.UTC(year, onTheDay ? month : month + 1, PAYOUT_DAY)).toISOString().slice(0, 10);
  const reached = amount >= PAYOUT_MINIMUM;
  return { minimum: PAYOUT_MINIMUM, reached, left: reached ? 0 : round2(PAYOUT_MINIMUM - amount), pct: Math.min(100, Math.round((amount / PAYOUT_MINIMUM) * 100)), next };
}
