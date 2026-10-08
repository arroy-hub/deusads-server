// Pure rules for the admin screens, kept apart from React and the database so
// they can be tested on their own (test/admin.test.mjs).

export const ROLES = ["developer", "advertiser", "admin"];
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
