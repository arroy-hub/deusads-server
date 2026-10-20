// Tells a dropped connection from a real fault. The cabinet words the first one kindly and retries it once the browser is
// back online; any other failure keeps its own message.
const DROPPED = /network ?error|failed to fetch|fetch failed|load failed|err_network|connection (was )?(lost|reset|closed|interrupted)|internet|offline/i;

export function isConnectionError(error) {
  if (!error) return false;
  // A browser that says it is offline explains whatever broke.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return DROPPED.test(`${error.name ?? ""} ${error.message ?? ""}`);
}
