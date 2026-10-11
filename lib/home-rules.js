// What the developer Home and the advertiser Home show, worked out from plain counts.

/**
 * The developer's path from nothing to an ad running, as ordered steps.
 * Exactly one step is "next": the first that is not done.
 */
export function developerSteps({ games = 0, placements = 0, open = 0, approved = 0 }) {
  const steps = [
    { key: "game", title: "Create a game", hint: "Name it and get an SDK key.", done: games > 0, href: "/dashboard/games" },
    { key: "sdk", title: "Connect the Unity SDK", hint: "Press Send placements in Unity.", done: placements > 0, href: "/dashboard/games" },
    { key: "open", title: "Open placements to advertisers", hint: "Choose what advertisers can book.", done: open > 0, href: "/dashboard/games" },
    { key: "approve", title: "See your first ad running", hint: "Ads go live as soon as an advertiser books an open placement.", done: approved > 0, href: "/dashboard/requests" },
  ];
  const next = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, state: step.done ? "done" : index === next ? "next" : "later" }));
}

/** Stage counts of an advertiser's bookings: waiting (pending or scheduled), live, finished (from bookingLabel text). */
export function advertiserPipeline({ creatives = [], campaigns = [], bookings = [] }) {
  const approvedCreatives = creatives.filter((item) => item.status === "approved").length;
  const waitingCreatives = creatives.filter((item) => item.status === "pending").length;
  const used = new Set(bookings.map((booking) => booking.campaignId));
  const drafts = campaigns.filter((campaign) => !used.has(campaign.id)).length;
  const labelOf = (booking) => String(booking.label ?? "");
  const waiting = bookings.filter((booking) => booking.status === "pending" || labelOf(booking).startsWith("Scheduled")).length;
  const live = bookings.filter((booking) => booking.status === "approved" && labelOf(booking).startsWith("Live")).length;
  const finished = bookings.filter((booking) => booking.status === "ended" || labelOf(booking) === "Ended").length;
  return {
    creatives: creatives.length,
    approvedCreatives,
    waitingCreatives,
    drafts,
    waiting,
    live,
    finished,
  };
}
