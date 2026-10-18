import { coverBackground } from "./game-cover.js";

/** The picture behind a campaign's page and its card. Until the campaign has its own, a colour picked by its id, so both always match. */
export function campaignCoverCss(campaignId) {
  const seed = [...String(campaignId)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return coverBackground(null, seed);
}
