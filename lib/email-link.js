// What the link in an email carries when it lands on /auth/callback.
//
// Two shapes are accepted:
//   ?token_hash=…&type=recovery     the link of our own email templates (supabase/email-templates): it points
//                                   straight at the dashboard, and the dashboard checks the one-time token itself.
//                                   The email then links to our own domain only, and the link works in any browser.
//   ?code=…                         Supabase's default templates: the link goes to Supabase first, which sends the
//                                   browser on with a code that only the browser that asked for it can exchange.

/** The kinds of one-time token Supabase issues by email. */
export const LINK_TYPES = ["recovery", "email_change", "email", "signup", "invite", "magiclink"];

/** What the address asks for: { kind: "token", type, tokenHash }, { kind: "code", code }, or null when it carries nothing usable. */
export function readEmailLink(searchParams) {
  const tokenHash = String(searchParams.get("token_hash") ?? "").trim();
  const type = String(searchParams.get("type") ?? "").trim();
  if (tokenHash && LINK_TYPES.includes(type)) return { kind: "token", type, tokenHash };
  const code = String(searchParams.get("code") ?? "").trim();
  if (code) return { kind: "code", code };
  return null;
}

/** Where to go afterwards: only a path inside the dashboard, never another site. */
export function landingPath(next) {
  return next && /^\/dashboard(\/|\?|$)/.test(next) && !next.startsWith("//") ? next : "/";
}

/**
 * Whether the link lets the person set a new password without the old one. A recovery token always does: that
 * is what it was issued for. With a code the address has to say so (reset=1), as before.
 */
export function allowsReset(link, searchParams) {
  if (!link) return false;
  if (link.kind === "token") return link.type === "recovery";
  return searchParams.get("reset") === "1";
}
