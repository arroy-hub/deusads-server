// What needs the advertiser's own action, counted the same way everywhere: the mark on a tab, the "Needs action" filter
// on the page under it and the mark on each row are one number. Pure (no React, no database).
//
// A creative needs action when DeusADS asked to change it (or one of its pictures) and nothing new was sent yet, when
// DeusADS blocked it (or one of its pictures), and when its review ended with a rejection.
// A campaign needs action when one of the pictures it shows is in one of the first two states, and when its budget ran out.
// What only waits for somebody else (a review, a developer's choice) is not here.

/** null, or { key: "changes" | "blocked" | "rejected", text } for a row of the creative library. */
export function creativeNeeds(item) {
  const holds = item?.holds?.length ? item.holds : item?.hold ? [item.hold] : [];
  const change = holds.find((hold) => hold.kind === "changes" && !hold.sent);
  if (change) return { key: "changes", text: change.shapeLabel ? `DeusADS asked to change the ${change.shapeLabel} picture` : "DeusADS asked to change it" };
  const blocked = holds.find((hold) => hold.kind === "blocked");
  if (blocked) return { key: "blocked", text: blocked.shapeLabel ? `The ${blocked.shapeLabel} picture is blocked by DeusADS` : "Blocked by DeusADS" };
  if (item?.status === "rejected") return { key: "rejected", text: "Rejected: upload a new version" };
  return null;
}

/**
 * null, or { key: "changes" | "blocked" | "budget", text } for a campaign. `statusKey` is its status, `holds` what
 * DeusADS holds of the pictures it shows now: [{ kind, sent }].
 */
export function campaignNeeds({ statusKey, holds = [] }) {
  if (statusKey === "ended" || statusKey === "draft") return null;
  const waiting = holds.filter((hold) => hold.kind === "changes" && !hold.sent).length;
  if (waiting) return { key: "changes", text: waiting === 1 ? "DeusADS asked to change a picture" : `DeusADS asked to change ${waiting} pictures` };
  const blocked = holds.filter((hold) => hold.kind === "blocked").length;
  if (blocked) return { key: "blocked", text: blocked === 1 ? "A picture is blocked by DeusADS" : `${blocked} pictures are blocked by DeusADS` };
  if (statusKey === "budget") return { key: "budget", text: "Out of budget: add budget to start it again" };
  return null;
}

/** How many of these rows need action; each row carries `needs` (null or an object). */
export const needsCount = (rows) => (rows ?? []).filter((row) => row?.needs).length;
