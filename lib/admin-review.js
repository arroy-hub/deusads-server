// Review creatives: rows, the history shown on a creative's card and the figures for the board. Pure (no React, no
// database), so test/admin-review.test.mjs can run it.
import { categoryLabel, AD_CATEGORIES } from "./categories.js";
import { fdt, shortId } from "./admin-format.js";
import { countBy, median, percentile, weekly, hours, bars, ring, stats, cols, funnel, RED, ORANGE, GREEN, BLUE } from "./admin-stats.js";

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
      uploaded: fdt(c.created_at),
      short: day(c.created_at).slice(5).replace("-", "/"),
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
    uploaded: fdt(a.created_at),
    short: day(a.created_at).slice(5).replace("-", "/"),
    createdAt: a.created_at,
    age: Math.max(0, Math.floor((now - Date.parse(a.created_at)) / DAY)),
    hoursWaiting: Math.max(0, (now - Date.parse(a.created_at)) / 36e5),
    out: "waiting",
    note: "",
    reviewedAt: null,
    hrs: null,
    creativeId: a.creativeId ?? null,
    first: true,
    reuploaded: false,
    reapproved: false,
  }));
  // What came of a rejection: the same advertiser uploading again in the same category later (a fix), and whether that was approved.
  const group = new Map();
  for (const r of rows) {
    const k = `${r.ownerId}|${r.category}`;
    if (!group.has(k)) group.set(k, []);
    group.get(k).push(r);
  }
  for (const list of group.values()) {
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    list.forEach((r, i) => {
      const before = list.slice(0, i), after = list.slice(i + 1);
      r.first = !before.some((x) => x.out === "rejected");
      r.reuploaded = r.out === "rejected" && after.length > 0;
      r.reapproved = r.out === "rejected" && after.some((x) => x.out === "approved");
    });
  }
  return { creatives: rows, assets: extra };
}

/** A short, comparable form of a free-text rejection reason ("Gambling is not allowed." -> "gambling is not allowed"). */
export const reasonKey = (note) => String(note ?? "").trim().replace(/[.!\s]+$/, "").toLowerCase().slice(0, 80);

const DISPUTE_OUT = (d) => (d.status === "open" ? "Still open" : d.outcome === "removed" ? "Creative removed · bookings unchanged · developer notified" : d.outcome === "paused" ? "Booking paused · creative stays · both sides notified" : d.initiator === "advertiser" ? "Dismissed · both sides notified" : "Dismissed · developer notified");

/**
 * The history of one creative, oldest first (the mockup's crEvents): [{ kind, who, text, when, at, facts: [[label, value, link?]] }].
 * `bookings` are rows of bookingRows, `disputes` rows of creative_disputes (with `byName` / `gameName` filled in).
 */
export function creativeEvents({ row, bookings = [], disputes = [] }) {
  const ev = [];
  ev.push({ kind: "adv", who: row.owner, text: row.kind === "asset" ? "Uploaded a picture for a format" : "Uploaded the creative", at: row.createdAt, when: fdt(row.createdAt), facts: [["File", `${row.name} · ${row.size}`], ["Category", row.categoryLabel], ["Contact", row.email || "—"], ["Queue", row.kind === "asset" ? "Format images" : "New creatives"]] });
  if (row.out === "waiting") ev.push({ kind: "sys", who: "System", text: "Waiting for review", at: null, when: "now", facts: [["Restricted category", row.restricted ? "Yes, look closely" : "No"], ["Sent", fdt(row.createdAt)]] });
  if (row.out === "approved") ev.push({ kind: "ok", who: "DeusADS admin", text: "Approved", at: row.reviewedAt, when: fdt(row.reviewedAt), facts: [["Decision", "Approved"], ["Effect", "Now reaches the SDK"]] });
  if (row.out === "rejected") ev.push({ kind: "bad", who: "DeusADS admin", text: "Rejected", at: row.reviewedAt, when: fdt(row.reviewedAt), facts: [["Reason", row.note || "No reason given"], ["Effect", "Taken off every placement"]] });
  for (const b of bookings) ev.push({ kind: "dev", who: b.developer, text: `Booked in ${b.game} · ${b.placement}`, at: b.createdAt, when: fdt(b.createdAt), facts: [["Booking", `Open booking #${shortId(b.id)}`, { card: "booking", id: b.id }], ["Advertiser → developer", `${b.advertiser} → ${b.developer}`], ["Period", b.period], ["Status", b.statusLabel]] });
  for (const d of disputes) {
    const adv = d.initiator === "advertiser";
    ev.push({ kind: "report", who: d.byName, text: `Dispute #${shortId(d.id)}: ${d.reason}`, at: d.created_at, when: fdt(d.created_at), facts: [["Dispute", `Open dispute #${shortId(d.id)}`, { card: "dispute", id: d.id }], ["From", `${adv ? "Advertiser" : "Developer"} ${d.byName}`], ["Outcome", DISPUTE_OUT(d)]] });
  }
  return ev.map((e, i) => ({ ...e, i })).sort((a, c) => (a.at ? Date.parse(a.at) : Infinity) - (c.at ? Date.parse(c.at) : Infinity) || a.i - c.i).map(({ i, ...e }) => e);
}

export const REVIEW_GROUPS = [["q", "Queue"], ["o", "Outcomes"], ["w", "Who submits"], ["t", "Trends"]];
export const REVIEW_DEFAULTS = ["rq", "rout", "rrsn", "rttr", "rsub", "rweek"];

/**
 * The widgets of the Review board, the mockup's catalog in its order. `all` is every creative of the last 90 days (any status);
 * waiting extra pictures count as waiting. Rows carry `first` (approved at the first upload) and `reuploaded` / `reapproved`
 * (what the advertiser did after a rejection).
 */
export function reviewWidgets(all) {
  const waiting = all.filter((x) => x.out === "waiting");
  const decided = all.filter((x) => x.out !== "waiting");
  const rejected = all.filter((x) => x.out === "rejected");
  const oldest = Math.max(0, ...waiting.map((x) => x.hoursWaiting));
  const reviewH = decided.map((x) => x.hrs).filter((h) => h != null && h > 0);
  const rate = new Map();
  for (const x of decided) { const r = rate.get(x.category) ?? [0, 0]; r[0]++; if (x.out === "rejected") r[1]++; rate.set(x.category, r); }
  const firstTry = decided.filter((x) => x.out === "approved" && x.first).length;
  const re = rejected.filter((x) => x.reuploaded);
  const ok = re.filter((x) => x.reapproved);
  return [
    { k: "rq", g: "q", t: "Waiting now", w: 4, info: "Creatives that wait for a decision. The oldest one shows how long an advertiser has been waiting.", data: stats([["Waiting", waiting.length], ["Oldest", hours(oldest), oldest > 47], ["Restricted", waiting.filter((x) => x.restricted).length]]) },
    { k: "rqc", g: "q", t: "Waiting by category", w: 6, info: "Categories of the creatives that wait now. Finance and gambling need a closer look.", data: bars(countBy(waiting, (x) => x.categoryLabel), ORANGE, "Nothing is waiting.") },
    { k: "rout", g: "o", t: "Outcomes", w: 4, info: "How reviews ended in the last 90 days.", data: ring([["Approved", all.filter((x) => x.out === "approved").length, GREEN], ["Rejected", rejected.length, RED], ["Waiting", waiting.length, "#e0a21a"]], "creatives") },
    { k: "rrsn", g: "o", t: "Rejection reasons", w: 6, info: "The reason you gave when rejecting.", data: bars(countBy(rejected.filter((x) => x.note), (x) => reasonKey(x.note)).slice(0, 5).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v]), RED, "No rejections with a reason yet.") },
    { k: "rrate", g: "o", t: "Rejection rate by category", w: 6, info: "Of the reviewed creatives in each category, how many were rejected.", data: bars([...rate.entries()].map(([k, [n, r]]) => [categoryLabel(k), r / n, `${Math.round((r / n) * 100)}% of ${n}`]).sort((a, b) => b[1] - a[1]), RED, "Nothing reviewed yet.") },
    { k: "rttr", g: "o", t: "Time to review", w: 4, info: "From upload to your decision. Slowest 10% means nine out of ten creatives were reviewed faster than this.", data: stats([["Median", reviewH.length ? hours(median(reviewH)) : "—"], ["Slowest 10%", reviewH.length ? hours(percentile(reviewH, 0.9)) : "—"], ["Reviewed", reviewH.length]]) },
    { k: "rfirst", g: "o", t: "Approved first time", w: 4, info: "Share of reviewed creatives that were approved on the first upload, not after a fix.", data: stats([["First try", decided.length ? `${Math.round((firstTry / decided.length) * 100)}%` : "—"], ["Reviewed", decided.length]]) },
    { k: "rsub", g: "w", t: "Advertisers who submit most", w: 6, info: "Advertisers ranked by creatives uploaded in the last 90 days.", data: bars(countBy(all, (x) => x.owner).slice(0, 5), ORANGE) },
    { k: "rrej", g: "w", t: "Advertisers with most rejections", w: 6, info: "Advertisers whose creatives were rejected most often.", data: bars(countBy(rejected, (x) => x.owner).slice(0, 5), RED, "No rejections yet.") },
    { k: "rcat", g: "w", t: "Categories submitted", w: 6, info: "Which categories advertisers upload.", data: bars(countBy(all, (x) => x.categoryLabel).slice(0, 6), ORANGE) },
    { k: "rsize", g: "w", t: "Formats submitted", w: 6, info: "Sizes of the uploaded creatives.", data: bars(countBy(all.filter((x) => x.size !== "—"), (x) => x.size).slice(0, 5), BLUE) },
    { k: "rweek", g: "t", t: "Uploads per week", w: 8, info: "New creatives in each of the last 13 weeks.", data: cols(weekly(all, (x) => x.age)) },
    { k: "rfix", g: "t", t: "After rejection", w: 6, info: "What happened next to rejected creatives: did the advertiser upload a fixed version, and was it approved.", data: funnel([["Rejected", rejected.length, RED], ["Fixed version uploaded", re.length, ORANGE], ["Fixed version approved", ok.length, GREEN]]) },
  ];
}
