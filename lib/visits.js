// A "visit" to the dashboard: it starts when the person comes back after being away for a while, and it
// ends with their last activity. "Since your last visit" on My games counts from the end of the previous one.
// Pure, so it can be tested; the layout and the games page write what this returns.

export const VISIT_GAP_MS = 30 * 60 * 1000; // away this long and the next page starts a new visit
export const TOUCH_MS = 5 * 60 * 1000; // activity is written at most this often

/**
 * What an account row becomes when the person opens a page at `now`.
 *   row  { visit_at, visit_active_at, since_at } (any may be null)
 * Returns { visit_at, visit_active_at, since_at, changed } as ISO strings (or null).
 */
export function nextVisit(row, now = Date.now()) {
  const at = new Date(now).toISOString();
  const active = row?.visit_active_at ? Date.parse(row.visit_active_at) : null;
  if (active === null || now - active > VISIT_GAP_MS) {
    return { visit_at: at, visit_active_at: at, since_at: row?.visit_active_at ?? null, changed: true };
  }
  const keep = { visit_at: row.visit_at ?? at, visit_active_at: row.visit_active_at, since_at: row.since_at ?? null };
  if (now - active > TOUCH_MS) return { ...keep, visit_active_at: at, changed: true };
  return { ...keep, changed: false };
}

/** Should the "since your last visit" summary be offered? Not before a first visit, and not once dismissed in this one. */
export function digestWanted({ visit_at, since_at, digest_dismissed_at }) {
  if (!since_at) return false;
  if (digest_dismissed_at && visit_at && Date.parse(digest_dismissed_at) >= Date.parse(visit_at)) return false;
  return true;
}
