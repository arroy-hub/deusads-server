// Where in the game and when in the session an ad was seen (migration 0041): views by scene and by the minute of the
// session, with how long they were looked at. The scene is the one the SDK named when it reported the view; the minute
// is the time since the session start the SDK announced (SDK 0.10+), so older views are Unknown. Pure, so the rules
// are tested without a database (test/context.test.mjs).

const number = (value) => Number(value ?? 0) || 0;

export const MINUTES = [
  { id: "m0", label: "1st minute" },
  { id: "m1", label: "2nd minute" },
  { id: "m2_4", label: "Minutes 3–5" },
  { id: "m5_9", label: "Minutes 6–10" },
  { id: "m10_19", label: "Minutes 11–20" },
  { id: "m20", label: "After 20 minutes" },
];

/** Under this many measured views an average length is shown but marked as thin. */
export const CONTEXT_MIN_MEASURED = 10;

/** A comparison between the start and the end of a session needs this many measured views on each side. */
export const CONTEXT_MIN_VIEWS = 20;

function figuresOf(row, views, total) {
  const measured = number(row?.measured);
  const seconds = number(row?.visible_seconds);
  return {
    views,
    share: total > 0 ? views / total : 0,
    measured,
    seconds,
    avgSeconds: measured > 0 ? seconds / measured : null,
    engaged: number(row?.engaged),
    engagedRate: measured > 0 ? number(row?.engaged) / measured : null,
    thin: measured > 0 && measured < CONTEXT_MIN_MEASURED,
  };
}

/**
 * Rows of game_context(.., "minute") / advertiser_context() -> the six minute buckets in order, then Unknown when
 * there are views without a known session start. summary compares the first two minutes with everything after the
 * 10th, only when both sides have enough measured views: { early, late, change } with the average seconds of each and
 * the relative change (negative = people look less later in the session).
 */
export function minuteTable(rows) {
  const byId = new Map((rows ?? []).map((row) => [row.bucket, row]));
  const total = [...byId.values()].reduce((sum, row) => sum + number(row.views), 0);
  const steps = MINUTES.map((minute) => ({ ...minute, ...figuresOf(byId.get(minute.id), number(byId.get(minute.id)?.views), total) }));
  if (number(byId.get("unknown")?.views) > 0) {
    steps.push({ id: "unknown", label: "Unknown", ...figuresOf(byId.get("unknown"), number(byId.get("unknown").views), total) });
  }

  const sum = (ids, key) => steps.filter((step) => ids.includes(step.id)).reduce((acc, step) => acc + step[key], 0);
  const early = { measured: sum(["m0", "m1"], "measured"), seconds: sum(["m0", "m1"], "seconds") };
  const late = { measured: sum(["m10_19", "m20"], "measured"), seconds: sum(["m10_19", "m20"], "seconds") };
  let summary = null;
  if (early.measured >= CONTEXT_MIN_VIEWS && late.measured >= CONTEXT_MIN_VIEWS && early.seconds > 0) {
    const earlyAvg = early.seconds / early.measured;
    const lateAvg = late.seconds / late.measured;
    summary = { early: earlyAvg, late: lateAvg, change: lateAvg / earlyAvg - 1 };
  }
  return { rows: steps, views: total, summary, empty: total === 0 };
}

/**
 * Rows of game_context(.., "scene") -> one row per scene, most viewed first. Views whose scene is not known come last
 * as Unknown scene. share is the part of all the game's views.
 */
export function sceneTable(rows) {
  const total = (rows ?? []).reduce((sum, row) => sum + number(row.views), 0);
  const scenes = (rows ?? []).map((row) => {
    const named = typeof row.bucket === "string" && row.bucket.length > 0;
    return { id: named ? row.bucket : "unknown", label: named ? row.bucket : "Unknown scene", known: named, ...figuresOf(row, number(row.views), total) };
  });
  scenes.sort((a, b) => Number(b.known) - Number(a.known) || b.views - a.views || a.label.localeCompare(b.label));
  return { rows: scenes, views: total, summary: null, empty: total === 0 };
}

/** { missing, ...minuteTable }. missing = migration 0041 is not applied (the panel stays off). */
export async function loadMinutes(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, ...minuteTable([]) };
  return { missing: false, ...minuteTable(result.data) };
}

/** { missing, ...sceneTable }. */
export async function loadScenes(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, ...sceneTable([]) };
  return { missing: false, ...sceneTable(result.data) };
}
