// What a person can choose to be told about, and through which channel. Pure data and rules, so the
// Notifications tab and notify() read the same list and it can be tested (test/notification-prefs.test.mjs).
//
// Each kind has a `type` stored in notification_prefs. No stored row means the defaults: shown under the
// bell, not sent by email.

export const DEFAULT_CHANNELS = { bell: true, email: false };

// [type, title, description]
const DEVELOPER = [
  {
    title: "Campaigns in your games",
    rows: [
      ["dev_campaign", "New campaign or creative in your game", "An advertiser starts showing in one of your games, or adds a creative to a running campaign."],
      ["dev_withdrew", "An advertiser withdrew a booking", "They cancelled a booking on one of your placements."],
    ],
  },
  {
    title: "Your reports",
    rows: [
      ["dev_report_decided", "DeusADS decided on your report", "Whether the creative was removed or your report was dismissed."],
      ["dev_booking_paused", "A booking in your game was paused", "An advertiser reported a booking and DeusADS paused it."],
    ],
  },
  {
    title: "Your games",
    rows: [
      ["dev_new_placements", "New placements found in a game", "The SDK reported a placement we hadn't seen before."],
      ["dev_game_silent", "A game stopped reporting", "No signal from the SDK for a while."],
    ],
  },
];

const ADVERTISER = [
  {
    title: "Your creatives",
    rows: [
      ["adv_creative_reviewed", "Creative or image approved or rejected", "The result of the review, with the reviewer's note."],
      ["adv_creative_removed", "Creative removed after a report", "A developer reported it and DeusADS removed it."],
      ["adv_booking_paused", "Booking paused after a report", "A developer reported it and DeusADS paused the booking."],
      ["adv_report_decided", "DeusADS decided on your report", "What was decided on a report you sent about a game."],
    ],
  },
  {
    title: "Your campaigns",
    rows: [
      ["adv_blocked", "A developer paused or blocked your campaign or creative", "In one game. Shows the reason if they gave one."],
      ["adv_limited", "Campaign limited, or a format is missing", "Something needs fixing before it can show everywhere."],
    ],
  },
];

const ADMIN = [
  {
    title: "To review",
    rows: [
      ["admin_review", "New creatives and images to review", "Whenever something lands in Review creatives."],
      ["admin_reports", "New reports", "Whenever a developer or an advertiser opens a dispute."],
    ],
  },
];

// Every role has the same last section. `channels` lists what can be switched: Product news has no bell.
const ACCOUNT = {
  title: "Account",
  rows: [
    ["account_security", "Account and security", "Sign-in changes, a new role, or your account being switched off."],
    ["product_news", "Product news", "Occasional updates about DeusADS. Off by default.", { bell: false }],
  ],
};

const BY_ROLE = { developer: DEVELOPER, advertiser: ADVERTISER, admin: ADMIN };

/**
 * The sections shown for a role, each row as { type, title, description, hasBell, hasEmail }.
 * The Account section is last for everyone.
 */
export function sectionsFor(role) {
  const shape = ([type, title, description, only]) => ({ type, title, description, hasBell: only?.bell !== false, hasEmail: only?.email !== false });
  return [...(BY_ROLE[role] ?? DEVELOPER), ACCOUNT].map((section) => ({ title: section.title, rows: section.rows.map(shape) }));
}

/** Every type that exists, for validation. */
export const ALL_TYPES = [...new Set([DEVELOPER, ADVERTISER, ADMIN, [ACCOUNT]].flat().flatMap((section) => section.rows.map((row) => row[0])))];

export const isKnownType = (type) => ALL_TYPES.includes(type);

/** Whether a channel exists for a type (Product news has no bell). */
export function hasChannel(type, channel) {
  for (const section of [...DEVELOPER, ...ADVERTISER, ...ADMIN, ACCOUNT]) {
    const row = section.rows.find((item) => item[0] === type);
    if (row) return row[3]?.[channel] !== false;
  }
  return false;
}

/** { bell, email } from a stored row (or nothing): the defaults fill what was never set. */
export function channelsOf(row) {
  return { bell: row?.bell ?? DEFAULT_CHANNELS.bell, email: row?.email ?? DEFAULT_CHANNELS.email };
}

/** A map type -> { bell, email } for every type of a role, from the stored rows. */
export function resolvePrefs(role, rows) {
  const stored = new Map((rows ?? []).map((row) => [row.type, row]));
  const result = {};
  for (const section of sectionsFor(role)) {
    for (const row of section.rows) result[row.type] = channelsOf(stored.get(row.type));
  }
  return result;
}

/**
 * Where a notification of this type goes. An unknown or missing type keeps the defaults. A channel that does
 * not exist for the type (a bell for Product news) is never used.
 */
export function deliveryFor(type, row) {
  const channels = channelsOf(row);
  return {
    bell: hasChannel(type, "bell") ? channels.bell : false,
    email: hasChannel(type, "email") ? channels.email : false,
  };
}

/** Why a choice cannot be stored, or null. */
export function prefProblem({ type, channel, value }) {
  if (!isKnownType(type)) return "Unknown kind of notification.";
  if (channel !== "bell" && channel !== "email") return "Unknown channel.";
  if (typeof value !== "boolean") return "Choose on or off.";
  if (!hasChannel(type, channel)) return "That kind of notification has no such channel.";
  return null;
}
