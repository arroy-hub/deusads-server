// Rules for the advertiser Overview and the campaign report. Pure: no React, no database, so they can be
// tested on their own (test/advertiser-overview.test.mjs). The loaders are in advertiser-data.js.

import { FORMATS, coverageByFormat, formatLabel, formatOf, pickImage } from "./formats.js";

/** "+12.4%" / "−6%" against the previous period, or null when there is nothing to compare with. */
export function deltaText(current, previous) {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  const change = ((now - before) / before) * 100;
  const rounded = Math.abs(change) < 10 ? Math.round(change * 10) / 10 : Math.round(change);
  if (rounded === 0) return { text: "no change", tone: "flat" };
  return { text: `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`, tone: rounded > 0 ? "up" : "down" };
}

/** A creative's shape for pickImage: the picture's proportions and its safe zone (null when unknown). */
export function creativeShape(row) {
  const width = Number(row?.width_px ?? row?.width);
  const height = Number(row?.height_px ?? row?.height);
  const hasZone = row?.safe_x != null && row?.safe_y != null;
  return {
    aspect: width > 0 && height > 0 ? width / height : null,
    safeZone: hasZone ? { x: row.safe_x, y: row.safe_y, w: row.safe_w, h: row.safe_h } : undefined,
  };
}

/**
 * Where a creative cannot be shown for lack of a picture: the standard formats it does not cover (so a
 * placement of that shape shows nothing) and how many of the given placements that touches.
 *   placements: [{ aspect }]  (a placement whose shape is unknown shows the main picture, so it never counts)
 *   assets:     [{ formatId, aspect, status }]
 */
export function coverageSummary({ creative, assets = [], placements = [] }) {
  const missingFormats = coverageByFormat({ creative, assets })
    .filter((row) => row.kind === "none")
    .map((row) => row.format.id);
  let known = 0;
  let missing = 0;
  for (const placement of placements) {
    const aspect = Number(placement?.aspect);
    if (!(aspect > 0)) continue;
    known += 1;
    if (pickImage({ creative, assets, surfaceAspect: aspect }).kind === "none") missing += 1;
  }
  return { missingFormats, missingLabels: missingFormats.map(shortFormat), missingPlacements: missing, placements: known };
}

/** "16:9" from "16:9 landscape". */
export function shortFormat(id) {
  return formatLabel(id).split(" ")[0];
}

const isLive = (booking) => booking.status === "approved" && String(booking.label ?? "").startsWith("Live");
const isScheduled = (booking) => booking.status === "approved" && String(booking.label ?? "").startsWith("Scheduled");

/** What a developer's control note says it is: "paused", "blocked", "category" or "" when nothing is in the way. */
export function controlKind(note) {
  const text = String(note ?? "");
  if (!text) return "";
  if (/does not show ads of this category/.test(text)) return "category";
  if (/paused/.test(text)) return "paused";
  if (/blocked/.test(text)) return "blocked";
  return "";
}

/**
 * Where a campaign stands, from its bookings (each with status, label and the developer's controlNote).
 * Returns { key, label, note }: draft | paused | waiting | scheduled | live | limited | stopped | ended.
 * `paused`: the advertiser paused the whole campaign (migration 0026).
 * `launched`: started by audience; with no booking yet it waits for a matching game instead of being a draft.
 */
export function campaignStatus(bookings, { paused = false, launched = false } = {}) {
  if (!bookings.length && launched) return { key: "waiting", label: "Waiting", note: "No game fits the audience yet. It starts by itself when one does." };
  if (!bookings.length) return { key: "draft", label: "Draft", note: "No placements yet" };
  if (paused && bookings.some((booking) => booking.status === "approved" || booking.status === "pending")) {
    return { key: "paused", label: "Paused", note: "You paused this campaign" };
  }
  const live = bookings.filter(isLive);
  if (live.length) {
    const held = live.filter((booking) => booking.controlNote).length;
    if (held === live.length) return { key: "stopped", label: "Not showing", note: "Developers paused or blocked every live placement" };
    if (held > 0) return { key: "limited", label: "Limited", note: `${held} of ${live.length} live placements switched off by developers` };
    return { key: "live", label: "Live", note: `${live.length} ${live.length === 1 ? "placement" : "placements"}` };
  }
  if (bookings.some((booking) => booking.status === "pending")) return { key: "waiting", label: "Waiting", note: "For the creative to be approved" };
  if (bookings.some(isScheduled)) return { key: "scheduled", label: "Scheduled", note: bookings.find(isScheduled).label };
  return { key: "ended", label: "Ended", note: "" };
}

/**
 * One row per game of a campaign: what the game delivered and whether it is showing the ads.
 *   bookings: loadBookings rows of the campaign (with controlNote)
 *   rows:     reportRows output (with gameId)
 * Games come busiest first. `avgVisible` is weighted by impressions.
 */
export function gameRows(bookings, rows) {
  const games = new Map();
  for (const booking of bookings) {
    const id = booking.gameId ?? booking.game;
    if (!games.has(id)) games.set(id, { id, game: booking.game, bookings: [], impressions: 0, weighted: 0, weight: 0 });
    games.get(id).bookings.push(booking);
  }
  for (const row of rows) {
    const id = row.gameId ?? row.game;
    const entry = games.get(id);
    if (!entry) continue;
    entry.impressions += Number(row.impressions) || 0;
    if (row.avgVisible != null && row.impressions > 0) {
      entry.weighted += row.avgVisible * row.impressions;
      entry.weight += row.impressions;
    }
  }
  const result = [...games.values()].map((entry) => {
    const status = gameStatus(entry.bookings);
    return {
      id: entry.id,
      game: entry.game,
      impressions: entry.impressions,
      avgVisible: entry.weight > 0 ? entry.weighted / entry.weight : null,
      ...status,
    };
  });
  const total = result.reduce((sum, row) => sum + row.impressions, 0);
  return result
    .map((row) => ({ ...row, share: total > 0 ? row.impressions / total : 0 }))
    .sort((a, b) => b.impressions - a.impressions || a.game.localeCompare(b.game));
}

/** The state of a campaign inside one game: { state, label, note }. */
export function gameStatus(bookings) {
  const live = bookings.filter(isLive);
  if (live.some((booking) => !booking.controlNote)) return { state: "showing", label: "Showing", note: "" };
  if (live.length) {
    const first = live.find((booking) => booking.controlNote);
    const kind = controlKind(first.controlNote);
    const label = kind === "paused" ? "Paused by developer" : kind === "category" ? "Category not shown" : "Blocked by developer";
    return { state: kind || "blocked", label, note: first.controlNote };
  }
  if (bookings.some((booking) => booking.status === "pending")) return { state: "waiting", label: "Waiting", note: "" };
  if (bookings.some(isScheduled)) return { state: "scheduled", label: "Scheduled", note: "" };
  return { state: "ended", label: "Ended", note: "" };
}

const SCOPE_TITLE = {
  campaign: { paused: "Campaign paused", blocked: "Campaign blocked" },
  creative: { paused: "Creative paused", blocked: "Creative blocked" },
  advertiser: { paused: "Account paused", blocked: "Account blocked" },
};

/**
 * The pauses and blocks developers put on a campaign, newest first: what was done, in which game, when, and why.
 *   controlRows: game_ad_controls rows (game_id, scope, target_id, state, reason, comment, changed_at)
 *   names:       { games: Map(id -> name), creatives: Map(id -> name) }
 * Only controls that touch this campaign are kept: the campaign itself, its creatives, the advertiser's account.
 */
export function controlLog({ controlRows = [], campaignId, advertiserId, creativeIds = [], names = {} }) {
  const creatives = new Set(creativeIds);
  return controlRows
    .filter((row) => {
      if (row.scope === "campaign") return row.target_id === campaignId;
      if (row.scope === "creative") return creatives.has(row.target_id);
      if (row.scope === "advertiser") return row.target_id === advertiserId;
      return false;
    })
    .map((row) => ({
      key: `${row.game_id}:${row.scope}:${row.target_id}`,
      game: names.games?.get(row.game_id) ?? "A game",
      title: SCOPE_TITLE[row.scope]?.[row.state] ?? "Switched off",
      what: row.scope === "creative" ? names.creatives?.get(row.target_id) ?? "" : "",
      state: row.state,
      reason: row.reason ?? "",
      comment: row.comment ?? "",
      at: row.changed_at ? String(row.changed_at).slice(0, 10) : "",
    }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.game.localeCompare(b.game));
}

/** The share of impressions per standard format, plus the formats that got none. [{ id, label, share, impressions }] */
export function formatShare(placementStats, aspectOf) {
  const counts = new Map(FORMATS.map((format) => [format.id, 0]));
  let other = 0;
  let total = 0;
  for (const item of placementStats ?? []) {
    const impressions = Number(item.impressions) || 0;
    total += impressions;
    const id = formatOf(Number(aspectOf.get(item.placement_id)));
    if (id && counts.has(id)) counts.set(id, counts.get(id) + impressions);
    else other += impressions;
  }
  const rows = FORMATS.map((format) => ({
    id: format.id,
    label: shortFormat(format.id),
    impressions: counts.get(format.id),
    share: total > 0 ? counts.get(format.id) / total : 0,
  }));
  if (other > 0) rows.push({ id: "other", label: "Other", impressions: other, share: total > 0 ? other / total : 0 });
  return rows;
}

/**
 * What needs the advertiser's attention, most urgent first. Each item: { key, tone, tag, title, text, href, action }.
 *   rejected:  [{ id, name, note }]
 *   gaps:      [{ id, name, missingLabels, missingPlacements }]
 *   limited:   [{ id, name, key, note }]                  campaigns that are limited or stopped
 *   disputes:  [{ creativeId, name, status, outcome, reason }]
 *   ending:    [{ id, name, endsOn }]               live campaigns; reported when they end within 3 days (today = YYYY-MM-DD)
 */
export function attentionItems({ rejected = [], gaps = [], limited = [], disputes = [], ending = [], today = "" }) {
  const items = [];
  for (const item of rejected) {
    items.push({
      key: `rejected:${item.id}`,
      tone: "bad",
      tag: "Rejected",
      title: `${item.name} was rejected`,
      text: item.note ? `Reason: ${item.note}` : "Upload a corrected version to book it.",
      href: `/dashboard/creatives/${item.id}`,
      action: "Open creative",
    });
  }
  for (const item of disputes) {
    if (item.status === "open") {
      items.push({
        key: `dispute:${item.creativeId}`,
        tone: "info",
        tag: "Under review",
        title: `A developer reported ${item.name}`,
        text: `Reported as: ${item.reason}. It keeps running until DeusADS decides.`,
        href: `/dashboard/creatives/${item.creativeId}`,
        action: "Open creative",
      });
    } else if (item.outcome === "removed") {
      items.push({
        key: `dispute-removed:${item.creativeId}`,
        tone: "bad",
        tag: "Removed",
        title: `${item.name} was removed after a report`,
        text: `Reported as: ${item.reason}.`,
        href: `/dashboard/creatives/${item.creativeId}`,
        action: "Open creative",
      });
    }
  }
  for (const item of limited) {
    items.push({
      key: `limited:${item.id}`,
      tone: "warn",
      tag: item.key === "stopped" ? "Not showing" : "Limited",
      title: item.key === "stopped" ? `${item.name} is not showing` : `${item.name} is limited by developers`,
      text: item.note,
      href: `/dashboard/advertising/c/${item.id}`,
      action: "See where and why",
    });
  }
  for (const item of gaps) {
    if (item.missingPlacements <= 0) continue;
    items.push({
      key: `gap:${item.id}`,
      tone: "warn",
      tag: "Format gap",
      title: `${item.name} is not shown in ${item.missingPlacements} ${item.missingPlacements === 1 ? "placement" : "placements"}`,
      text: `No picture for ${item.missingLabels.join(", ")}. Cropping the main image would cut your safe zone.`,
      href: `/dashboard/creatives/${item.id}`,
      action: "Add formats",
    });
  }
  for (const item of ending) {
    const left = daysUntil(item.endsOn, today);
    if (left == null || left < 0 || left > 3) continue;
    items.push({
      key: `ending:${item.id}`,
      tone: "info",
      tag: "Ends soon",
      title: left === 0 ? `${item.name} ends today` : `${item.name} ends in ${left} ${left === 1 ? "day" : "days"}`,
      text: "Extend it or start a copy so the ads do not stop.",
      href: `/dashboard/advertising/c/${item.id}/settings`,
      action: "Extend",
    });
  }
  const order = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Whole days from `today` to `date` (both YYYY-MM-DD); null when either is missing. */
export function daysUntil(date, today) {
  if (!date || !today) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The creatives of a campaign side by side: impressions, share, average view time, and a "Longer views" mark on the
 * one people watch noticeably longer (at least 10% above the next, with enough views for it to mean something).
 *   bookings:       loadBookings rows of the campaign (creativeId, creativeName, creativeUrl, status)
 *   placementStats: advertiser_placement_stats rows (creative_id, impressions, avg_visible_seconds)
 * Creatives with no impressions stay in the list, last.
 */
export function creativeComparison(bookings, placementStats, { minImpressions = 100 } = {}) {
  const rows = new Map();
  for (const booking of bookings) {
    if (!rows.has(booking.creativeId)) rows.set(booking.creativeId, { id: booking.creativeId, name: booking.creativeName, url: booking.creativeUrl ?? "", impressions: 0, weighted: 0, weight: 0 });
  }
  for (const item of placementStats ?? []) {
    const row = rows.get(item.creative_id);
    if (!row) continue;
    const count = Number(item.impressions) || 0;
    row.impressions += count;
    if (item.avg_visible_seconds != null) {
      row.weighted += Number(item.avg_visible_seconds) * count;
      row.weight += count;
    }
  }
  const total = [...rows.values()].reduce((sum, row) => sum + row.impressions, 0);
  const list = [...rows.values()]
    .map((row) => ({ id: row.id, name: row.name, url: row.url, impressions: row.impressions, share: total > 0 ? row.impressions / total : 0, avgVisible: row.weight > 0 ? row.weighted / row.weight : null, longer: false }))
    .sort((a, b) => b.impressions - a.impressions || a.name.localeCompare(b.name));
  const measured = list.filter((row) => row.avgVisible != null && row.impressions >= minImpressions).sort((a, b) => b.avgVisible - a.avgVisible);
  if (measured.length >= 2 && measured[0].avgVisible >= measured[1].avgVisible * 1.1) measured[0].longer = true;
  return list;
}

/**
 * The sentence under the campaign tabs when delivery is held back: { lead, text }, or null when nothing is.
 *   games:  gameRows output (state: showing | paused | category | blocked | …)
 *   status: campaignStatus output
 */
export function deliveryNote(games, status) {
  if (status?.key !== "limited" && status?.key !== "stopped") return null;
  const paused = games.filter((game) => game.state === "paused" || game.state === "category").length;
  const blocked = games.filter((game) => game.state === "blocked").length;
  const showing = games.filter((game) => game.state === "showing").length;
  const gameWord = (count) => (count === 1 ? "One game" : `${count} games`);
  const parts = [];
  if (paused > 0) parts.push(`${gameWord(paused)} paused this campaign`);
  if (blocked > 0) parts.push(`${paused > 0 ? (blocked === 1 ? "another" : `${blocked} others`) : gameWord(blocked)} blocked it or one of its creatives`);
  const held = parts.length ? `${parts.join(" and ")}.` : "";
  const rest = showing > 0 ? `Your ads still run in ${showing} other ${showing === 1 ? "game" : "games"}.` : "It is not showing in any game right now.";
  return {
    lead: status.key === "stopped" ? "This campaign is not showing." : "Delivery is limited.",
    text: `${held} ${rest} Reasons are listed below.`.trim(),
  };
}
