// Review creatives: rows, the history shown on a creative's card and the figures for the board. Pure (no React, no
// database), so test/admin-review.test.mjs can run it.
import { categoryLabel, AD_CATEGORIES } from "./categories.js";
import { countBy, median, percentile, weekly, hours, bars, ring, stats, cols, RED, ORANGE, GREEN, BLUE, AMBER } from "./admin-stats.js";

const DAY = 864e5;
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
export const isRestricted = (id) => AD_CATEGORIES.some((c) => c.id === id && c.restricted);

/**
 * Review rows from creatives (and pending extra pictures). `kind` is "creative" or "asset"; `out` is waiting / approved /
 * rejected. `hrs` is the time from upload to the decision, `age` the days since the upload.
 */
export function reviewRows({ creatives, assets = [], urlOf, now = Date.now() }) {
  const owner = (a) => a?.company || a?.email || "Unknown";
  const rows = creatives.map((c) => {
    const reviewed = c.reviewed_at ? Date.parse(c.reviewed_at) : null;
    return {
      id: c.id,
      kind: "creative",
      name: c.name,
      url: c.storage_path ? urlOf(c.storage_path) : "",
      ownerId: c.owner_id ?? null,
      owner: owner(c.accounts),
      email: c.accounts?.email ?? "",
      category: c.ad_category ?? "other",
      categoryLabel: categoryLabel(c.ad_category ?? "other"),
      restricted: isRestricted(c.ad_category),
      size: c.width_px && c.height_px ? `${c.width_px} × ${c.height_px}` : "—",
      created: day(c.created_at),
      createdAt: c.created_at,
      age: Math.max(0, Math.floor((now - Date.parse(c.created_at)) / DAY)),
      hoursWaiting: Math.max(0, (now - Date.parse(c.created_at)) / 36e5),
      out: c.status === "pending" ? "waiting" : c.status,
      note: c.review_note ?? "",
      reviewedAt: c.reviewed_at ?? null,
      hrs: reviewed ? Math.max(0, (reviewed - Date.parse(c.created_at)) / 36e5) : null,
    };
  });
  const extra = assets.map((a) => ({
    id: a.id,
    kind: "asset",
    name: a.name,
    url: a.storage_path ? urlOf(a.storage_path) : "",
    ownerId: a.ownerId ?? null,
    owner: a.owner,
    email: a.email ?? "",
    category: a.category ?? "other",
    categoryLabel: categoryLabel(a.category ?? "other"),
    restricted: isRestricted(a.category),
    size: a.width_px && a.height_px ? `${a.width_px} × ${a.height_px}` : "—",
    created: day(a.created_at),
    createdAt: a.created_at,
    age: Math.max(0, Math.floor((now - Date.parse(a.created_at)) / DAY)),
    hoursWaiting: Math.max(0, (now - Date.parse(a.created_at)) / 36e5),
    out: "waiting",
    note: "",
    reviewedAt: null,
    hrs: null,
  }));
  return { creatives: rows, assets: extra };
}

/** A short, comparable form of a free-text rejection reason ("Gambling is not allowed." -> "gambling is not allowed"). */
export const reasonKey = (note) => String(note ?? "").trim().replace(/[.!\s]+$/, "").toLowerCase().slice(0, 80);

/**
 * The history of one creative, oldest first: [{ kind, who, text, when, facts: [[label, value]] }]. `bookings` are
 * rows of loadBookings, `disputes` rows of creative_disputes (with `byName` / `gameName` filled in).
 */
export function creativeEvents({ row, bookings = [], disputes = [] }) {
  const ev = [];
  ev.push({ kind: "adv", who: row.owner, text: row.kind === "asset" ? "Uploaded a picture for a format" : "Uploaded the creative", at: row.createdAt, facts: [["File", `${row.name} · ${row.size}`], ["Category", row.categoryLabel], ["Contact", row.email || "—"]] });
  if (row.out === "waiting") ev.push({ kind: "sys", who: "System", text: "Waiting for review", at: null, facts: [["Restricted category", row.restricted ? "Yes, look closely" : "No"], ["Sent", row.created]] });
  if (row.out === "approved") ev.push({ kind: "ok", who: "Admin", text: "Approved", at: row.reviewedAt, facts: [["Decision", "Approved"], ["Effect", "Now reaches the SDK"]] });
  if (row.out === "rejected") ev.push({ kind: "bad", who: "Admin", text: "Rejected", at: row.reviewedAt, facts: [["Reason", row.note || "No reason given"], ["Effect", "Taken off every placement"]] });
  for (const b of bookings) ev.push({ kind: "dev", who: b.developerName, text: `Booked in ${b.game} · ${b.placement}`, at: b.createdAt ?? b.created, facts: [["Advertiser → developer", `${b.advertiser} → ${b.developerName}`], ["Period", b.dates || "No dates"], ["Status", b.label]] });
  for (const d of disputes) ev.push({ kind: "report", who: d.byName, text: `Dispute: ${d.reason}`, at: d.created_at, facts: [["Reported in", d.gameName], ["Comment", d.comment || "No comment"], ["Outcome", d.status === "open" ? "Still open" : d.outcome === "removed" ? "Creative removed" : "Dismissed"]] });
  return ev.sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity));
}

export const REVIEW_GROUPS = [["q", "Queue"], ["o", "Outcomes"], ["w", "Who submits"], ["t", "Trends"]];
export const REVIEW_DEFAULTS = ["r_queue", "r_out", "r_reasons", "r_time", "r_subs", "r_week"];

/** The widgets of the board. `all` is every creative of the last 90 days (any status); waiting extra pictures count as waiting. */
export function reviewWidgets(all) {
  const waiting = all.filter((x) => x.out === "waiting");
  const decided = all.filter((x) => x.out !== "waiting");
  const rejected = all.filter((x) => x.out === "rejected");
  const oldest = Math.max(0, ...waiting.map((x) => x.hoursWaiting));
  const reviewH = decided.map((x) => x.hrs).filter((h) => h != null);
  const rate = new Map();
  for (const x of decided) { const r = rate.get(x.category) ?? [0, 0]; r[0]++; if (x.out === "rejected") r[1]++; rate.set(x.category, r); }
  return [
    { k: "r_queue", g: "q", t: "Waiting now", w: 4, info: "Creatives that wait for a decision. The oldest one shows how long an advertiser has been waiting.", data: stats([["Waiting", waiting.length], ["Oldest", hours(waiting.length ? oldest : null), oldest > 47], ["Restricted", waiting.filter((x) => x.restricted).length]]) },
    { k: "r_qcat", g: "q", t: "Waiting by category", w: 6, info: "Categories of the creatives that wait now. Restricted ones (alcohol and tobacco, gambling, dating and adult) need a closer look.", data: bars(countBy(waiting, (x) => x.categoryLabel), ORANGE, "Nothing is waiting.") },
    { k: "r_out", g: "o", t: "Outcomes", w: 4, info: "How reviews ended in the last 90 days.", data: ring([["Approved", all.filter((x) => x.out === "approved").length, GREEN], ["Rejected", rejected.length, RED], ["Waiting", waiting.length, AMBER]], "creatives") },
    { k: "r_reasons", g: "o", t: "Rejection reasons", w: 6, info: "The reason you wrote when rejecting, grouped by its text.", data: bars(countBy(rejected.filter((x) => x.note), (x) => reasonKey(x.note)).slice(0, 5).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v]), RED, "No rejections with a reason yet.") },
    { k: "r_rate", g: "o", t: "Rejection rate by category", w: 6, info: "Of the reviewed creatives in each category, how many were rejected.", data: bars([...rate.entries()].map(([k, [n, r]]) => [categoryLabel(k), r / n, `${Math.round((r / n) * 100)}% of ${n}`]).sort((a, b) => b[1] - a[1]).slice(0, 6), RED, "Nothing reviewed yet.") },
    { k: "r_time", g: "o", t: "Time to review", w: 4, info: "From upload to your decision. Slowest 10% means nine out of ten creatives were reviewed faster than this.", data: stats([["Median", hours(reviewH.length ? median(reviewH) : null)], ["Slowest 10%", hours(reviewH.length ? percentile(reviewH, 0.9) : null)], ["Reviewed", reviewH.length]]) },
    { k: "r_subs", g: "w", t: "Advertisers who submit most", w: 6, info: "Advertisers ranked by creatives uploaded in the last 90 days.", data: bars(countBy(all, (x) => x.owner).slice(0, 5), ORANGE) },
    { k: "r_rejadv", g: "w", t: "Advertisers with most rejections", w: 6, info: "Advertisers whose creatives were rejected most often.", data: bars(countBy(rejected, (x) => x.owner).slice(0, 5), RED, "No rejections yet.") },
    { k: "r_cats", g: "w", t: "Categories submitted", w: 6, info: "Which categories advertisers upload.", data: bars(countBy(all, (x) => x.categoryLabel).slice(0, 6), ORANGE) },
    { k: "r_sizes", g: "w", t: "Sizes submitted", w: 6, info: "Pixel sizes of the uploaded creatives.", data: bars(countBy(all.filter((x) => x.size !== "—"), (x) => x.size).slice(0, 5), BLUE) },
    { k: "r_week", g: "t", t: "Uploads per week", w: 8, info: "New creatives in each of the last 13 weeks.", data: cols(weekly(all, (x) => x.age)) },
  ];
}
