// Pure rules for the account page, kept apart from React and the database so they can be tested on
// their own (test/account-rules.test.mjs).

export const ROLE_NAMES = { developer: "Developer", advertiser: "Advertiser", admin: "Admin" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const isEmail = (value) => EMAIL.test(String(value ?? "").trim());

/** ISO 3166-1 alpha-2 codes offered in the Country field. Names come from Intl at display time. */
export const COUNTRY_CODES = (
  "AF AL DZ AD AO AR AM AU AT AZ BH BD BY BE BJ BO BA BW BR BG KH CM CA CL CN CO CR HR CU CY CZ DK DO EC EG SV EE ET FI FR GE DE GH GR GT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KW KG LV LB LT LU MY MT MX MD MC MN ME MA NP NL NZ NI NG MK NO OM PK PA PY PE PH PL PT QA RO RU SA RS SG SK SI ZA KR ES LK SE CH TW TH TN TR UA AE GB US UY UZ VE VN"
).split(" ");

/** [{ code, name }] sorted by name, for the select. */
export function countryOptions(locale = "en") {
  let names;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  return COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** A company or studio name: trimmed, inner spaces collapsed, at most 120 characters. */
export function cleanName(value, max = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

/** "https://x.com" from "x.com" or "https://x.com"; "" for empty; null when it cannot be a web address. */
export function cleanWebsite(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const full = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(full);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || /\s/.test(text)) return null;
    return full.slice(0, 200);
  } catch {
    return null;
  }
}

/** A phone number: digits with + ( ) - . and spaces, 5 to 15 digits; "" for empty; null when it is not one. */
export function cleanPhone(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^[0-9+()\-. ]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 5 && digits.length <= 15 ? text.slice(0, 40) : null;
}

/**
 * Checks what was typed on the Profile tab. Company is required for everyone; the email only when an admin
 * edits another person's account (the owner changes theirs in Sign-in & security). Returns the cleaned
 * values to store ("" becomes null) and a message per field that is wrong.
 */
export function checkProfile(input, { role = "developer", withEmail = false } = {}) {
  const errors = {};
  const values = {};
  const company = cleanName(input.company);
  if (!company) errors.company = role === "advertiser" ? "Required before you can start a campaign." : role === "developer" ? "Required before you can add a game." : "Required.";
  values.company = company || null;

  values.contact_name = cleanName(input.contact_name, 80) || null;

  const website = cleanWebsite(input.website);
  if (website === null) errors.website = "Enter a web address like https://example.com.";
  values.website = website || null;

  const country = String(input.country ?? "").trim().toUpperCase();
  if (country && !COUNTRY_CODES.includes(country)) errors.country = "Choose a country from the list.";
  values.country = country || null;

  if (role === "advertiser") {
    const phone = cleanPhone(input.phone);
    if (phone === null) errors.phone = "Enter a phone number, like +49 30 5555 0142.";
    values.phone = phone || null;
  }

  if (withEmail) {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!email) errors.email = "An email is required.";
    else if (!isEmail(email)) errors.email = "Enter a valid email address.";
    values.email = email;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

/** Why a password change must be refused, or null. `needCurrent` is false when an admin sets it. */
export function passwordProblem({ current, next, repeat }, { needCurrent = true } = {}) {
  if (needCurrent && !String(current ?? "")) return "Enter your current password.";
  if (String(next ?? "").length < MIN_PASSWORD) return `The new password needs at least ${MIN_PASSWORD} characters.`;
  if (next !== repeat) return "The two new passwords don't match.";
  if (needCurrent && next === current) return "Choose a password you haven't used here.";
  return null;
}

/** Why an email change must be refused, or null. `current` is the address in use now. */
export function emailChangeProblem({ email, current }) {
  const next = String(email ?? "").trim().toLowerCase();
  if (!isEmail(next)) return "Enter a valid email address.";
  if (next === String(current ?? "").trim().toLowerCase()) return "That is already your email.";
  return null;
}

/** First bytes of a PNG or a JPEG. */
export function imageKind(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}

/** Why an avatar upload is refused, or null. Looks at the real bytes, not the name the browser gave. */
export function avatarProblem({ size, bytes }) {
  if (!size) return "Choose an image.";
  if (size > AVATAR_MAX_BYTES) return "That image is over 2 MB.";
  if (!imageKind(bytes)) return "Use a PNG or JPG image.";
  return null;
}

/** The storage path of a new avatar inside the owner's own folder. */
export const avatarPath = (accountId, kind, stamp = Date.now()) => `${accountId}/avatar-${stamp}.${kind}`;

/** Does the side menu show the amber dot: no company name yet, or an email change waiting for its link. */
export const needsAttention = ({ company, pendingEmail }) => !String(company ?? "").trim() || Boolean(pendingEmail);

/** One or two capitals for the round avatar when there is no picture. */
export function initials({ company, contact_name, email } = {}) {
  const source = String(company || contact_name || email || "?").trim();
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "?").toUpperCase();
}

/**
 * What stops an account from being deleted, or null. A developer must remove their games first, an
 * advertiser must stop their running campaigns, and an admin account is never deleted from here.
 */
export function deleteBlocker({ role, games = [], runningCampaigns = 0 }) {
  if (role === "admin") return { kind: "admin", message: "Admin accounts can't be deleted here." };
  if (role === "developer" && games.length > 0) {
    return {
      kind: "games",
      message: `You still have ${games.length} game${games.length === 1 ? "" : "s"}. Remove ${games.length === 1 ? "it" : "them"} first.`,
      games,
    };
  }
  if (role === "advertiser" && runningCampaigns > 0) {
    return {
      kind: "campaigns",
      message: `You still have ${runningCampaigns} running campaign${runningCampaigns === 1 ? "" : "s"}. Stop ${runningCampaigns === 1 ? "it" : "them"} first.`,
      count: runningCampaigns,
    };
  }
  return null;
}

/** Campaigns of an advertiser that show now: ids of approved bookings that include `today` ("YYYY-MM-DD"). */
export function runningCampaignIds(bookings, today) {
  const ids = new Set();
  for (const booking of bookings ?? []) {
    if (booking.status !== "approved") continue;
    if (booking.starts_on && booking.starts_on > today) continue;
    if (booking.ends_on && booking.ends_on < today) continue;
    ids.add(booking.campaign_id ?? booking.id);
  }
  return ids;
}

/** "Chrome on Windows" from a user-agent string. */
export function sessionLabel(userAgent) {
  const ua = String(userAgent ?? "");
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const system = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return system ? `${browser} on ${system}` : browser;
}

/** "now", "5 min ago", "3 h ago", "2 days ago", "3 weeks ago", "2 months ago". */
export function agoLabel(date, now = Date.now()) {
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 2) return "now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  if (days < 60) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return `${months} months ago`;
}
