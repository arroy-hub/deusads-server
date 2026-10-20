// The figures and words on a campaign's card and strip in the Campaigns window. Pure, so the rules can be tested.
// A campaign here is a row of loadCampaignList: { name, status: { key, label, note }, starts, ends, launched, audience,
// impressions, daily: number[] }.

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const days = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`);
/** Whole days from `b` to `a` (both "YYYY-MM-DD"). */
export const dayDiff = (a, b) => Math.round((days(a) - days(b)) / DAY);
/** "5 Oct". */
export function dayText(isoDate) {
  if (!isoDate) return "";
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** Impressions as the card prints them: 184K, 96.4K, 1.2M (the exact number is in the report). */
export function compactCount(value) {
  const n = Number(value) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return String(n);
}

/** The colour of a status, as a CSS variable of the window. */
export const TONE_VAR = { live: "live", limited: "warn", paused: "warn", stopped: "stop", scheduled: "sched", waiting: "sched", draft: "mute", ended: "mute" };

/** Where a status sits when the list is sorted by status; busiest first inside a status. */
const RANK = { live: 0, limited: 0, stopped: 0, paused: 1, scheduled: 2, waiting: 2, draft: 3, ended: 4 };

/** The order of the list. `key`: status | impressions | name | dates. `dir`: asc | desc. Returns a new array. */
export function sortCampaigns(campaigns, key = "status", dir = "asc") {
  const by = {
    status: (a, b) => (RANK[a.status.key] ?? 3) - (RANK[b.status.key] ?? 3) || b.impressions - a.impressions,
    impressions: (a, b) => a.impressions - b.impressions,
    name: (a, b) => a.name.localeCompare(b.name),
    dates: (a, b) => (a.starts || "9").localeCompare(b.starts || "9"),
  };
  const sorted = [...campaigns].sort(by[key] ?? by.status);
  return dir === "desc" ? sorted.reverse() : sorted;
}

/**
 * The date bar of a card: what to print above the bar, how full it is and the note below it.
 * `cls` is a list of modifiers: is-running (stripes), is-open (no end), is-over, is-future, is-none.
 */
export function dateBar(campaign, today) {
  const { starts, ends, status } = campaign;
  const key = status.key;
  if (!starts) {
    if (campaign.launched && key !== "ended") {
      const left = ends ? dayDiff(ends, today) : null;
      const note = left != null && left >= 0 ? `Starts when the creative is approved · ends ${left === 0 ? "today" : `in ${left} ${left === 1 ? "day" : "days"}`}` : "Starts when the creative is approved";
      return { cls: `is-future${ends ? "" : " is-open"}`, pct: 0, top: ["On approval", ends ? dayText(ends) : "No end"], note };
    }
    return { cls: "is-none", pct: 0, top: null, note: "Dates are set with the placements" };
  }
  const top = [dayText(starts), ends ? dayText(ends) : "No end"];
  const elapsed = dayDiff(today, starts) + 1;
  let cls = "";
  let pct;
  let note;
  if (key === "ended") {
    cls = "is-over";
    pct = 100;
    note = ends && dayDiff(today, ends) > 0 ? `Ended ${dayDiff(today, ends)} ${dayDiff(today, ends) === 1 ? "day" : "days"} ago` : ends ? `Ended ${dayText(ends)}` : "Stopped";
  } else if (elapsed < 1) {
    cls = "is-future";
    pct = 0;
    const until = dayDiff(starts, today);
    note = `Starts in ${until} ${until === 1 ? "day" : "days"}`;
  } else if (ends) {
    const total = dayDiff(ends, starts) + 1;
    const left = dayDiff(ends, today);
    pct = Math.min(100, (elapsed / total) * 100);
    note = `Day ${elapsed} of ${total} · ${left === 0 ? "ends today" : `${left} ${left === 1 ? "day" : "days"} left`}`;
    if (key === "paused") note = `Paused · ${note}`;
    else if (key !== "stopped") cls = "is-running";
  } else {
    pct = 72;
    note = `Day ${elapsed} · no end date`;
    if (key === "paused") note = `Paused · ${note}`;
    else if (key !== "stopped") cls = "is-running";
  }
  if (!ends) cls = `${cls} is-open`.trim();
  return { cls, pct, top, note };
}

/** The shorter bar of a strip: the same bar, with the dates and the day count above it on one line. */
export function stripBar(campaign, today) {
  const bar = dateBar(campaign, today);
  const { starts, ends, status } = campaign;
  if (!starts && bar.cls === "is-none") return { ...bar, line: "Not scheduled", note: "Set with placements" };
  const elapsed = starts ? dayDiff(today, starts) + 1 : 0;
  let note = bar.note;
  if (starts && status.key !== "ended" && elapsed >= 1 && ends) note = `Day ${elapsed} of ${dayDiff(ends, starts) + 1}`;
  else if (starts && status.key !== "ended" && elapsed >= 1) note = `Day ${elapsed}`;
  else if (!starts && bar.top) note = "On approval";
  return { ...bar, line: bar.top ? `${bar.top[0]} → ${bar.top[1]}` : "", note };
}

/** "Live · day 14 of 42": the line under a campaign's name. */
export function subLine(campaign, today) {
  const { starts, ends, status } = campaign;
  const elapsed = starts ? dayDiff(today, starts) + 1 : 0;
  let text = "";
  if (starts && status.key !== "ended" && elapsed >= 1 && ends) text = ` · day ${elapsed} of ${dayDiff(ends, starts) + 1}`;
  else if (starts && status.key !== "ended" && elapsed >= 1) text = ` · day ${elapsed}`;
  else if ((status.key === "scheduled" || status.key === "waiting") && starts && elapsed < 1) text = ` · starts in ${dayDiff(starts, today)} days`;
  return { label: status.label, text };
}

/** The line chart of impressions per day, in a 110 x 34 box: { line, area, end: [x, y] }, or null when there is nothing to draw. */
export function sparkShape(series) {
  const values = (series ?? []).map(Number);
  const top = Math.max(0, ...values);
  if (values.length < 2 || top <= 0) return null;
  const points = values.map((v, i) => [(i / (values.length - 1)) * 108 + 1, 31 - (v / top) * 27]);
  const line = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  return { line, area: `${line}L109 33L1 33Z`, end: points[points.length - 1] };
}

/** "1 game", "12 games". */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
