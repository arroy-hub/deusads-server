// The addresses of the server. Games carry the API address inside their build, so it is on DeusADS's own
// domain (api.deusads.com) and the earlier one (deusads-server.vercel.app) keeps answering beside it.
// People use the dashboard on app.deusads.com.

/** Where the dashboard lives: what links in emails and notifications point to. */
export const DASHBOARD_URL = "https://app.deusads.com";

const OWN_DOMAIN = "deusads.com";

/**
 * An address released games may be moved to, or null. The SDK (0.14 and later) accepts only https addresses
 * on deusads.com with nothing but the host, and refuses anything else, so the same rule is applied here: a
 * mistyped setting is left out of the manifest instead of being sent to every game.
 */
export function allowedMove(value) {
  const text = String(value ?? "").trim().replace(/\/+$/, "");
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host !== OWN_DOMAIN && !host.endsWith(`.${OWN_DOMAIN}`)) return null;
  return `https://${host}`;
}

/**
 * The address the manifest tells games to use from their next launch, or null (the usual case: games stay on
 * the addresses built into them). Set SDK_SERVER_URL on the deployment to move them; remove it to take the
 * move back.
 */
export function sdkServerUrl(env = process.env) {
  return allowedMove(env.SDK_SERVER_URL);
}
