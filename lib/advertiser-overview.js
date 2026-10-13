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
 * Returns { key, label, note }: draft | waiting | scheduled | live | limited | stopped | ended.
 */
export function campaignStatus(bookings) {
  if (!bookings.length) return { key: "draft", label: "Draft", note: "No placements yet" };
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
 */
export function attentionItems({ rejected = [], gaps = [], limited = [], disputes = [] }) {
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
  const order = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}
