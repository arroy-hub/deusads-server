// Frequency and creative fatigue (migration 0039): how often the same player sees the ads, and whether he looks
// at them less when he sees the same creative again. A player is an anonymous install ID, so views from SDKs that
// sent none (before 0.9) are counted apart and never in the figures per player.
// Pure, so the rules are tested without a database (test/frequency.test.mjs).

const number = (value) => Number(value ?? 0) || 0;

export const FREQUENCY_BUCKETS = [
  { id: "v1", label: "1 view" },
  { id: "v2", label: "2 views" },
  { id: "v3", label: "3 views" },
  { id: "v4_5", label: "4–5 views" },
  { id: "v6_10", label: "6–10 views" },
  { id: "v11", label: "11 or more" },
];

/**
 * Rows of game_frequency() / advertiser_frequency() -> how the players split by number of ads seen.
 *   avgFrequency  ads seen per player (views of players with an ID ÷ those players)
 *   repeatShare   players who saw an ad more than once ÷ players
 *   untracked     views without a player ID: shown, never part of the figures per player
 */
export function frequencyTable(rows) {
  const byId = new Map((rows ?? []).map((row) => [row.bucket, row]));
  const buckets = FREQUENCY_BUCKETS.map((bucket) => ({
    ...bucket,
    players: number(byId.get(bucket.id)?.players),
    views: number(byId.get(bucket.id)?.views),
  }));
  const players = buckets.reduce((sum, bucket) => sum + bucket.players, 0);
  const views = buckets.reduce((sum, bucket) => sum + bucket.views, 0);
  const untracked = number(byId.get("untracked")?.views);
  const repeat = buckets.filter((bucket) => bucket.id !== "v1").reduce((sum, bucket) => sum + bucket.players, 0);
  return {
    players,
    views,
    untracked,
    avgFrequency: players > 0 ? views / players : null,
    repeatShare: players > 0 ? repeat / players : null,
    buckets: buckets.map((bucket) => ({ ...bucket, share: players > 0 ? bucket.players / players : 0 })),
    empty: players === 0 && untracked === 0,
  };
}

/** { missing, ...frequencyTable }. missing = migration 0039 is not applied (the panel stays off). */
export async function loadFrequency(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, ...frequencyTable([]) };
  return { missing: false, ...frequencyTable(result.data) };
}

export const EXPOSURES = [
  { id: "e1", label: "1st time" },
  { id: "e2", label: "2nd time" },
  { id: "e3", label: "3rd time" },
  { id: "e4_5", label: "4th–5th time" },
  { id: "e6", label: "6th time and later" },
];

/** A comparison needs this many measured views on each side, or it is only noise. */
export const FATIGUE_MIN_VIEWS = 20;

/**
 * Rows of game_fatigue() / advertiser_fatigue() -> attention at each repeat of the same creative for the same player.
 *   avgSeconds   average length of the measured views (SDK 0.11+)
 *   engagedRate  engaged views ÷ measured views
 * summary compares the first time with the 3rd time and later, only when both have enough measured views:
 * { first, later, change } where change is the relative change of the average seconds (negative = people look less).
 */
export function fatigueTable(rows) {
  const byId = new Map((rows ?? []).map((row) => [row.exposure, row]));
  const steps = EXPOSURES.map((exposure) => {
    const row = byId.get(exposure.id);
    const views = number(row?.views);
    const measured = number(row?.measured);
    return {
      ...exposure,
      views,
      measured,
      seconds: number(row?.visible_seconds),
      engaged: number(row?.engaged),
      avgSeconds: measured > 0 ? number(row?.visible_seconds) / measured : null,
      engagedRate: measured > 0 ? number(row?.engaged) / measured : null,
    };
  });

  const first = steps[0];
  const laterSteps = steps.slice(2);
  const later = {
    measured: laterSteps.reduce((sum, step) => sum + step.measured, 0),
    seconds: laterSteps.reduce((sum, step) => sum + step.seconds, 0),
    engaged: laterSteps.reduce((sum, step) => sum + step.engaged, 0),
  };
  let summary = null;
  if (first.measured >= FATIGUE_MIN_VIEWS && later.measured >= FATIGUE_MIN_VIEWS && first.avgSeconds > 0) {
    const laterAvg = later.seconds / later.measured;
    summary = {
      firstSeconds: first.avgSeconds,
      laterSeconds: laterAvg,
      change: laterAvg / first.avgSeconds - 1,
      firstEngaged: first.engagedRate,
      laterEngaged: later.engaged / later.measured,
    };
  }
  return { steps, summary, empty: steps.every((step) => step.views === 0) };
}

/** { missing, ...fatigueTable }. missing = migration 0039 is not applied (the panel stays off). */
export async function loadFatigue(call) {
  const result = await call();
  if (result.error) return { missing: true, error: result.error, ...fatigueTable([]) };
  return { missing: false, ...fatigueTable(result.data) };
}
