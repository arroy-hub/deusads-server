// Tells people what happened: a row in public.notifications (shown under the bell) and, when
// RESEND_API_KEY and RESEND_FROM are set, an email. Which of the two happens is the person's choice
// per kind of notification (Your account → Notifications, migration 0030): by default the bell only.
// A call without a `type` keeps those defaults. Notifying is best effort: it never throws and never
// blocks the action that caused it. Without migration 0013 the insert simply fails quietly; without
// 0030 everybody has the defaults.

import { DEFAULT_CHANNELS, deliveryFor } from "./notification-prefs.js";

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://deusads-server.vercel.app";

/** Subject and plain-text body of the email for a notification. */
export function emailParts(text, link, site = SITE()) {
  const url = link ? `${site}${link.startsWith("/") ? link : `/${link}`}` : `${site}/dashboard`;
  return { subject: `DeusADS: ${text}`.slice(0, 150), body: `${text}\n\nOpen the dashboard: ${url}\n` };
}

async function sendEmail(service, accountId, text, link) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return;
  const { data } = await service.from("accounts").select("email").eq("id", accountId).maybeSingle();
  if (!data?.email) return;
  const { subject, body } = emailParts(text, link);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [data.email], subject, text: body }),
    signal: AbortSignal.timeout(4000),
  });
}

/** Where this notification goes for this person: the stored choice for its type, else the defaults. */
export async function deliveryOf(service, accountId, type) {
  if (!type) return DEFAULT_CHANNELS;
  try {
    const { data, error } = await service.from("notification_prefs").select("bell, email").eq("account_id", accountId).eq("type", type).maybeSingle();
    return deliveryFor(type, error ? null : data);
  } catch {
    return deliveryFor(type, null);
  }
}

/** One notification. `text` is cut to 300 characters. `type` is one of lib/notification-prefs.js. */
export async function notify(service, { accountId, text, link = null, type = null }) {
  if (!accountId || !text) return;
  const message = String(text).slice(0, 300);
  try {
    const way = await deliveryOf(service, accountId, type);
    if (way.bell) {
      const { error } = await service.from("notifications").insert({ account_id: accountId, text: message, link });
      if (error) return console.warn("[DeusADS] notification not saved:", error.code);
    }
    if (way.email) await sendEmail(service, accountId, message, link);
  } catch (error) {
    console.warn("[DeusADS] notification failed:", error?.message);
  }
}

/** The same notification to several accounts (duplicates removed). */
export async function notifyMany(service, accountIds, text, link, type = null) {
  const unique = [...new Set((accountIds ?? []).filter(Boolean))];
  await Promise.allSettled(unique.map((accountId) => notify(service, { accountId, text, link, type })));
}
