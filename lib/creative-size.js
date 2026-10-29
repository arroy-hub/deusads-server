// Sizes of creative pictures. No image library in here: the cabinet's browser code uses it too.

/**
 * Creatives larger than this on the longest side are made smaller when they are uploaded: the SDK never
 * keeps a picture bigger than this in memory (headsets cannot hold more), so the extra pixels would only
 * cost download time. The original is not kept.
 */
export const LONG_SIDE_LIMIT = 4096;

/** Below this the picture looks soft on a banner the player stands close to. The SDK cannot add detail the file does not have. */
export const SOFT_BELOW = 1280;

/** What the cabinet recommends for a banner that may be seen from close by. */
export const RECOMMENDED_LONG_SIDE = 2048;

/** The size a picture ends up at: unchanged when it fits, otherwise the same shape with the longest side at the limit. */
export function fitSize(width, height, limit = LONG_SIDE_LIMIT) {
  const longest = Math.max(width, height);
  if (!(longest > limit)) return { width, height, resized: false };
  const scale = limit / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), resized: true };
}

export function overLimit(width, height, limit = LONG_SIDE_LIMIT) {
  return Math.max(Number(width) || 0, Number(height) || 0) > limit;
}

/** The sentence the cabinet shows when a picture was made smaller. */
export function resizedNotice(from, to, limit = LONG_SIDE_LIMIT) {
  return `The limit of ${limit} px on the longest side was exceeded, so this picture was processed: ${from.width} × ${from.height} px became ${to.width} × ${to.height} px. The original was not kept.`;
}

/**
 * What to tell the advertiser about a picture before it is uploaded: null when the size is fine,
 * otherwise { tone: "warn" | "info", text }.
 */
export function sizeAdvice(width, height) {
  const longest = Math.max(Number(width) || 0, Number(height) || 0);
  if (!longest) return null;
  if (longest > LONG_SIDE_LIMIT) {
    const to = fitSize(width, height);
    return { tone: "info", text: `Over the ${LONG_SIDE_LIMIT} px limit on the longest side. It will be processed on upload (${width} × ${height} px becomes ${to.width} × ${to.height} px) and the original is not kept.` };
  }
  if (longest < SOFT_BELOW) {
    return { tone: "warn", text: `Small for a banner players may come close to: ${longest} px on the longest side. It can look soft up close. ${RECOMMENDED_LONG_SIDE} px or more keeps it sharp.` };
  }
  return null;
}
