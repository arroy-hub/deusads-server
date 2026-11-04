// Does what a game IS now (its genres, platforms, languages, countries) still fit the audience of a booked ad?
// The manifest decides this every time a game asks for its ads (campaignMayServe / eligibleRows); the dashboards use the
// same rule so that what they show matches what really runs. Pure except loadFitInputs, which only reads.

import { evaluate, whyNot } from "./targeting.js";

/**
 * Why a booked creative is not shown in a game because of what the game is, or null when it may be shown.
 *   campaignTargeting / creativeTargeting: audiences (null = every game)
 *   profile: { genres, platforms, languages, countries } of the game, or null when it could not be read (nothing is claimed)
 * Returns { scope: "campaign" | "creative", why } like the manifest checks them: the campaign's audience first.
 */
export function audienceProblem({ campaignTargeting = null, creativeTargeting = null, profile }) {
  if (!profile) return null;
  const campaign = evaluate(profile, campaignTargeting);
  if (!campaign.fits) return { scope: "campaign", why: whyNot(campaign.problems) };
  const creative = evaluate(profile, creativeTargeting);
  if (!creative.fits) return { scope: "creative", why: whyNot(creative.problems) };
  return null;
}

/** "this game does not fit the campaign's audience (no matching genre)" */
export function audienceWords(problem) {
  return `this game does not fit the ${problem.scope === "campaign" ? "campaign's" : "creative's"} audience (${problem.why})`;
}

/** What an advertiser is told about a booking the game's description keeps out. "" when nothing is in the way. */
export function audienceNote(problem) {
  if (!problem) return "";
  const words = audienceWords(problem);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}, so the ad is not shown here. It shows again if the game fits again.`;
}

/**
 * The audiences and game descriptions needed to judge a set of bookings, or null when any of them cannot be read
 * (a migration missing): then the dashboards simply claim nothing.
 */
export async function loadFitInputs(service, { campaignIds = [], creativeIds = [], gameIds = [] }) {
  const unique = (list) => [...new Set((list ?? []).filter(Boolean))];
  const campaigns = unique(campaignIds);
  const creatives = unique(creativeIds);
  const games = unique(gameIds);
  const none = { data: [], error: null };
  const [campaignRows, creativeRows, gameRows] = await Promise.all([
    campaigns.length ? service.from("campaigns").select("id, targeting").in("id", campaigns) : none,
    creatives.length ? service.from("creatives").select("id, targeting").in("id", creatives) : none,
    games.length ? service.from("games").select("id, genres, platforms, languages, countries").in("id", games) : none,
  ]);
  if (campaignRows.error || creativeRows.error || gameRows.error) return null;
  return {
    campaigns: new Map((campaignRows.data ?? []).map((row) => [row.id, row.targeting ?? null])),
    creatives: new Map((creativeRows.data ?? []).map((row) => [row.id, row.targeting ?? null])),
    profiles: new Map((gameRows.data ?? []).map((row) => [row.id, { genres: row.genres, platforms: row.platforms, languages: row.languages, countries: row.countries }])),
  };
}

/** audienceProblem for one booking, from loadFitInputs output (null inputs: nothing is claimed). */
export function fitOf(inputs, { campaignId, creativeId, gameId }) {
  if (!inputs) return null;
  return audienceProblem({
    campaignTargeting: inputs.campaigns.get(campaignId) ?? null,
    creativeTargeting: inputs.creatives.get(creativeId) ?? null,
    profile: inputs.profiles.get(gameId) ?? null,
  });
}
