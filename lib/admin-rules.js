// Pure rules for the admin screens, kept apart from React and the database so
// they can be tested on their own (test/admin.test.mjs).

export const ROLES = ["developer", "advertiser", "admin"];

/**
 * Who may use the advertiser tools (creatives with an audience, booking, campaigns, reports). Admins
 * may too, so one account can try both sides of the platform: an admin can also book placements in
 * games of their own, which an advertiser never can.
 */
export const canAdvertise = (role) => role === "advertiser" || role === "admin";

export const DECISIONS = ["approved", "rejected"];

/** "approved" | "rejected", or null for anything else. */
export function parseDecision(value) {
  return DECISIONS.includes(value) ? value : null;
}

/** A reviewer's note: trimmed, capped, null when empty. */
export function cleanNote(value) {
  const text = String(value ?? "").trim().slice(0, 500);
  return text || null;
}

/**
 * Why a role change must be refused, or null when it is allowed. An admin cannot
 * change their own role: it is the easiest way to leave the platform with no admin.
 * The first admin is set by hand in the database.
 */
export function roleChangeProblem({ actorId, targetId, role }) {
  if (!ROLES.includes(role)) return "Unknown role.";
  if (!targetId) return "Unknown account.";
  if (actorId === targetId) {
    return "You cannot change your own role. Ask another admin, or do it in the database.";
  }
  return null;
}

/** A company name for an advertiser application: trimmed, 2 to 120 characters, or null. */
export function cleanCompany(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  return text.length >= 2 ? text : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

/**
 * Why a new user cannot be created from what the admin typed, or null when it is fine. The email must
 * look like one, the password needs at least MIN_PASSWORD characters, the role must be a known one.
 */
export function newUserProblem({ email, password, role }) {
  if (!EMAIL.test(String(email ?? "").trim())) return "Enter a valid email address.";
  if (String(password ?? "").length < MIN_PASSWORD) return `The password needs at least ${MIN_PASSWORD} characters.`;
  if (!ROLES.includes(role)) return "Choose a role.";
  return null;
}

/**
 * The accounts that are active: a developer who has a game, or an advertiser with a campaign that is
 * running now (an approved booking whose dates include today; no dates means it runs until stopped).
 * `gameOwnerIds` are the owners of all games; `bookings` are { advertiser_id, status, starts_on, ends_on }.
 * `today` is "YYYY-MM-DD" in UTC.
 */
export function activeAccountIds(gameOwnerIds, bookings, today) {
  const active = new Set(gameOwnerIds);
  for (const booking of bookings ?? []) {
    if (booking.status !== "approved") continue;
    if (booking.starts_on && booking.starts_on > today) continue;
    if (booking.ends_on && booking.ends_on < today) continue;
    active.add(booking.advertiser_id);
  }
  return active;
}
