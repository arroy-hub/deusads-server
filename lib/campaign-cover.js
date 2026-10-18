import { coverBackground, parseCover } from "./game-cover.js";

/** Which of the default colours a campaign gets, picked from its id so the page and the card always agree. */
export const coverSeed = (campaignId) => [...String(campaignId)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

/**
 * The picture behind a campaign's page and its card: the one the advertiser uploaded, the colour they chose, or, until
 * they choose, the picture of the campaign's first creative (a colour picked by the campaign's id when it has none).
 *   value     campaigns.cover: null, "preset:<id>" or "image:<path>"
 *   firstUrl  the first creative's picture, or ""
 *   urlOf     storage path -> public URL
 */
export function campaignCoverCss({ id, value = null, firstUrl = "", urlOf = () => "" }) {
  const kind = parseCover(value).kind;
  if (kind === "default" && firstUrl) return `center / cover no-repeat url("${firstUrl}")`;
  return coverBackground(value, coverSeed(id), urlOf);
}

/** The little status dot on a campaign's icon, the same light tones a game's SDK dot has. */
export const STATUS_DOT = { live: "#3fb577", limited: "#e0a23a", paused: "#e0a23a", stopped: "#d0503a", scheduled: "#5b8fd6", waiting: "#5b8fd6", draft: "#9aa0a6", ended: "#9aa0a6" };
