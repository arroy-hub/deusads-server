// Visibility and attention (migration 0035): how many chances an ad had, how many were seen, for how long,
// from how far and how head-on. The SDK (0.11+) measures each view for as long as it lasts.
// Pure, so the rules are tested without a database (test/attention.test.mjs).

/** A view is engaged when it lasts this long ... */
export const ENGAGED_SECONDS = 3;
/** ... and the player is this close (metres) or closer. The same two numbers are in the SQL of migration 0035. */
export const ENGAGED_METRES = 3;

const number = (value) => Number(value ?? 0) || 0;
const orNull = (value) => (value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

export const BUCKETS = [
  { id: "under_2", label: "1–2 s" },
  { id: "from_2_to_5", label: "2–5 s" },
  { id: "from_5_to_10", label: "5–10 s" },
  { id: "over_10", label: "10 s +" },
];

/**
 * One row of game_attention() / advertiser_attention() ready to draw.
 *   viewability  views ÷ opportunities, at most 1. Both come from SDK 0.11+, so older data never skews it.
 *   engagedRate  engaged views ÷ measured views.
 * Anything that cannot be told yet (no opportunities, no measured views) is null.
 */
export function attentionFigures(row) {
  const measured = number(row?.measured);
  const opportunities = number(row?.opportunities);
  const engaged = number(row?.engaged);
  const buckets = BUCKETS.map((bucket) => {
    const count = number(row?.[bucket.id]);
    return { ...bucket, count, share: measured > 0 ? count / measured : 0 };
  });
  return {
    measured,
    opportunities,
    viewability: measured > 0 && opportunities > 0 ? Math.min(1, measured / opportunities) : null,
    medianSeconds: measured > 0 ? orNull(row?.median_seconds) : null,
    avgDistance: measured > 0 ? orNull(row?.avg_distance) : null,
    avgFraction: measured > 0 ? orNull(row?.avg_fraction) : null,
    avgAngle: measured > 0 ? orNull(row?.avg_angle) : null,
    engaged,
    engagedRate: measured > 0 ? engaged / measured : null,
    buckets,
    empty: measured === 0 && opportunities === 0,
  };
}

/** Runs the rpc; { row, missing }. missing = migration 0035 is not applied (or the call failed): the panel stays off. */
export async function loadAttention(call) {
  const result = await call();
  if (result.error) return { row: null, missing: true, error: result.error };
  return { row: result.data?.[0] ?? null, missing: false };
}
