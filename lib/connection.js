// How a game's connection to the SDK is described: from the last time the SDK asked the server for anything.

export const QUIET_DAYS = 8; // this long without a signal and the game is called quiet
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "2 h ago", "3 days ago" */
export function agoText(at, now = Date.now()) {
  const gap = Math.max(0, now - Date.parse(at));
  if (gap < MINUTE) return "just now";
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)} min ago`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)} h ago`;
  const days = Math.floor(gap / DAY);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/**
 * { mode: "ok" | "new" | "silent", chip, short, last } for a game.
 *   ok      the SDK was heard from within QUIET_DAYS: "Connected · 2 h ago"
 *   new     never heard from: "Waiting for the SDK"
 *   silent  QUIET_DAYS or more without a signal: "No signal for 8 days"
 */
export function connection(lastSignalAt, now = Date.now()) {
  if (!lastSignalAt) return { mode: "new", chip: "Waiting for the SDK", short: "Waiting", last: "None yet" };
  const days = Math.floor(Math.max(0, now - Date.parse(lastSignalAt)) / DAY);
  if (days >= QUIET_DAYS) return { mode: "silent", chip: `No signal for ${days} days`, short: "No signal", last: agoText(lastSignalAt, now), days };
  return { mode: "ok", chip: `Connected · ${agoText(lastSignalAt, now)}`, short: "Connected", last: agoText(lastSignalAt, now) };
}
