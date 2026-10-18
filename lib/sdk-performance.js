// SDK performance (migration 0038): frame rate, stutters, how long creatives take to get ready, and the SDK's own
// errors, as reported by the SDK (0.11+) inside the game. Developer-only: the numbers describe the game, never the
// player, and advertisers never see them. Pure, so the rules are tested without a database
// (test/sdk-performance.test.mjs).

import { valueLabel } from "./audience.js";

const number = (value) => Number(value ?? 0) || 0;

/** A number from a client pulled into 0..max; anything that is not a finite number is 0. */
function bounded(value, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
}
const whole = (value, max) => Math.floor(bounded(value, max));
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * The report the SDK sent with an upload (body.performance), made safe to add up: whole numbers, sensible limits, and
 * parts never bigger than their whole (slow frames <= frames, and so on). One bad value can neither fail the batch nor
 * distort the sums. Returns the argument of add_session_performance(), or null when the report holds nothing: the SDK
 * always sends the object, all zeros when it has nothing to say.
 */
export function performanceFrom(raw) {
  if (!raw || typeof raw !== "object") return null;
  const frames = whole(raw.frames, 500_000);
  const seconds = frames > 0 ? round(bounded(raw.seconds, 86_400), 2) : 0;
  const slowFrames = Math.min(whole(raw.slowFrames, 500_000), frames);
  const adFrames = Math.min(whole(raw.adFrames, 500_000), frames);
  const loads = whole(raw.loads, 10_000);
  const cachedLoads = whole(raw.cachedLoads, 10_000);
  const manifestLoads = whole(raw.manifestLoads, 1_000);
  const report = {
    frames,
    seconds,
    slow_frames: slowFrames,
    hitches: Math.min(whole(raw.hitches, 500_000), slowFrames),
    worst_ms: frames > 0 ? round(bounded(raw.worstMs, 60_000), 1) : 0,
    ad_frames: adFrames,
    ad_seconds: adFrames > 0 ? Math.min(round(bounded(raw.adSeconds, 86_400), 2), seconds) : 0,
    ad_slow_frames: Math.min(whole(raw.adSlowFrames, 500_000), adFrames, slowFrames),
    loads,
    load_ms: loads > 0 ? round(bounded(raw.loadMs, 100_000_000), 1) : 0,
    load_ms_max: loads > 0 ? round(bounded(raw.loadMsMax, 600_000), 1) : 0,
    cached_loads: cachedLoads,
    cached_ms: cachedLoads > 0 ? round(bounded(raw.cachedMs, 100_000_000), 1) : 0,
    manifest_loads: manifestLoads,
    manifest_ms: manifestLoads > 0 ? round(bounded(raw.manifestMs, 100_000_000), 1) : 0,
    manifest_failed: whole(raw.manifestFailed, 10_000),
    manifest_cached: whole(raw.manifestCached, 10_000),
    creative_failed: whole(raw.creativeFailed, 10_000),
    creative_invalid: whole(raw.creativeInvalid, 10_000),
    upload_failed: whole(raw.uploadFailed, 10_000),
  };
  return Object.values(report).some((value) => value > 0) ? report : null;
}

/** What went wrong, as the dashboard names it. `key` is the column of session_performance. */
export const PROBLEMS = [
  { key: "manifest_failed", field: "manifestFailed", label: "Manifest not received", hint: "The game could not get the list of ads from the server, even after retrying." },
  { key: "manifest_cached", field: "manifestCached", label: "Old manifest used", hint: "The server could not be reached, so the copy kept on the device was used." },
  { key: "creative_failed", field: "creativeFailed", label: "Creative not downloaded", hint: "A picture could not be downloaded, so its placement showed your fallback." },
  { key: "creative_invalid", field: "creativeInvalid", label: "Creative not readable", hint: "A picture arrived but is not a valid PNG or JPG." },
  { key: "upload_failed", field: "uploadFailed", label: "Upload to DeusADS failed", hint: "Views or figures could not be sent; they were kept and sent again." },
];

/** Rate of a part in a whole, or null when there is no whole. */
const ratio = (part, whole_) => (whole_ > 0 ? part / whole_ : null);

/** The sums of one group of sessions (a row of game_sdk_performance) -> the figures the panel draws. */
export function figuresOf(row) {
  const sessions = number(row?.sessions);
  const frames = number(row?.frames);
  const seconds = number(row?.seconds);
  const slow = number(row?.slow_frames);
  const hitches = number(row?.hitches);
  const adFrames = number(row?.ad_frames);
  const adSeconds = number(row?.ad_seconds);
  const adSlow = number(row?.ad_slow_frames);
  const plainFrames = Math.max(frames - adFrames, 0);
  const plainSeconds = Math.max(seconds - adSeconds, 0);
  const plainSlow = Math.max(slow - adSlow, 0);
  const loads = number(row?.loads);
  const cachedLoads = number(row?.cached_loads);
  const manifestLoads = number(row?.manifest_loads);

  const problems = PROBLEMS.map((problem) => {
    const count = number(row?.[problem.key]);
    return { ...problem, count, per100: sessions > 0 ? (count / sessions) * 100 : null };
  });

  return {
    sessions,
    playHours: seconds / 3600,
    fps: ratio(frames, seconds),
    slowShare: ratio(slow, frames),
    hitches,
    hitchesPerHour: seconds > 0 ? (hitches / seconds) * 3600 : null,
    worstMs: number(row?.worst_ms),
    // With an ad in view against the rest of the play: a hint, since the scene differs too.
    withAd: { seconds: adSeconds, fps: ratio(adFrames, adSeconds), slowShare: ratio(adSlow, adFrames) },
    withoutAd: { seconds: plainSeconds, fps: ratio(plainFrames, plainSeconds), slowShare: ratio(plainSlow, plainFrames) },
    loads,
    loadAvgMs: ratio(number(row?.load_ms), loads),
    loadMaxMs: number(row?.load_ms_max),
    cachedLoads,
    cachedAvgMs: ratio(number(row?.cached_ms), cachedLoads),
    manifestAvgMs: ratio(number(row?.manifest_ms), manifestLoads),
    problems,
    problemCount: problems.reduce((sum, problem) => sum + problem.count, 0),
  };
}

/** Rows of one dimension (platform or device), longest play first, ready to draw. */
export function groupTable(rows, dimension, { top = 10 } = {}) {
  return (rows ?? [])
    .slice(0, top)
    .map((row) => ({ value: row.value ?? null, label: valueLabel(dimension, row.value ?? null), ...figuresOf(row) }));
}

/** Developer: { missing, total, platforms, devices }. missing = migration 0038 is not applied (the panel stays off). */
export async function loadSdkPerformance(call) {
  const [all, platform, device] = await Promise.all([call("all"), call("platform"), call("device")]);
  const failed = [all, platform, device].find((result) => result.error);
  if (failed) return { missing: true, error: failed.error, total: figuresOf(null), platforms: [], devices: [] };
  return {
    missing: false,
    total: figuresOf(all.data?.[0]),
    platforms: groupTable(platform.data, "platform"),
    devices: groupTable(device.data, "device"),
  };
}
