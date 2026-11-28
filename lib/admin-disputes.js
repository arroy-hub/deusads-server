// Disputes both ways: rows, the history of one dispute and the figures for the board. Pure (no React, no database).
import { categoryLabel } from "./categories.js";
import { fdt, fdtTime, spaced } from "./admin-format.js";
import { credits } from "./wallet.js";
import { ADMIN_OUTCOME } from "./report-rules.js";
import { ruleForReason } from "./platform-rules.js";
import { countBy, median, percentile, weekly, hours, bars, ring, stats, cols, funnel, note, RED, ORANGE, AMBER, GREEN, BLUE, GREY } from "./admin-stats.js";

const DAY = 864e5;
const day = (iso) => (iso ? String(iso).slice(0, 10) : "");

export const OUTCOMES = { removed: "Creative blocked", changes: "Change requested", paused: "Booking paused", dismissed: "No violation" };
/** The pill of a settled report: [label, tone]. An advertiser's dismissed report stays "Dismissed". */
export const outcomePill = (r) => (r.status === "dismissed" && r.initiator === "advertiser" ? ["Dismissed", "good"] : ADMIN_OUTCOME[r.status] ?? ["Open", "warn"]);
export const outcomeOf = (d) => (d.status === "open" ? "open" : d.outcome ?? "dismissed");

/**
 * Rows from creative_disputes (`initiator` developer | advertiser) with names filled in by the caller:
 * `byName` (who reported), `againstName` (who is reported), `gameName`, `creativeName`, `creativeUrl`, `category`.
 */
export function disputeRows(list, now = Date.now()) {
  return list.map((d) => {
    const initiator = d.initiator === "advertiser" ? "advertiser" : "developer";
    const created = Date.parse(d.created_at);
    const resolved = d.resolved_at ? Date.parse(d.resolved_at) : null;
    return {
      id: d.id,
      initiator,
      dev: initiator === "developer" ? d.byName : d.againstName,
      adv: initiator === "advertiser" ? d.byName : d.againstName,
      reuploaded: Boolean(d.reuploaded),
      reapproved: Boolean(d.reapproved),
      by: d.byName,
      byId: initiator === "advertiser" ? d.advertiser_id : d.developer_id,
      against: d.againstName,
      againstId: initiator === "advertiser" ? d.developer_id : d.advertiser_id,
      game: d.gameName,
      gameId: d.game_id,
      creative: d.creativeName,
      // the picture the report is about: a creative in one shape (migration 0063); empty for the whole creative
      shape: d.shape ?? null,
      shapeLabel: d.shapeLabel ?? "",
      picture: d.shapeLabel ? `${d.creativeName} · ${d.shapeLabel}` : d.creativeName,
      campaignId: d.campaign_id ?? null,
      creativeId: d.creative_id,
      creativeUrl: d.creativeUrl ?? "",
      bookingId: d.booking_id ?? null,
      category: d.category ?? "other",
      categoryLabel: categoryLabel(d.category ?? "other"),
      reason: d.reason,
      comment: d.comment ?? "",
      adminNote: d.admin_note ?? "",
      // the decision: the rule it points at and the messages to both sides (migration 0064)
      rule: d.rule ?? "",
      advNote: d.adv_note ?? "",
      devNote: d.dev_note ?? "",
      held: d.held ?? null, // what holds the creative now: changes | blocked | null
      heldHere: Boolean(d.heldHere), // ...by the decision on this report: it can be answered about, or taken back
      waiting: Boolean(d.waiting), // the advertiser wrote last and waits for an answer
      resent: Boolean(d.resent), // a new version waits for review
      status: outcomeOf(d), // open | removed | changes | paused | dismissed
      open: d.status === "open",
      created: day(d.created_at),
      day: fdt(d.created_at),
      when: `${fdtTime(d.created_at)} UTC`,
      createdAt: d.created_at,
      resolvedAt: d.resolved_at ?? null,
      age: Math.max(0, Math.floor((now - created) / DAY)),
      hours: resolved ? Math.max(0, (resolved - created) / 36e5) : null,
      waitingHours: resolved ? null : Math.max(0, (now - created) / 36e5),
    };
  });
}

const BOOKING_RULE = {
  "Views look fake": "Impressions come from real players",
  "Placement is hard to see": "Placements are where players can see them",
  "Not the audience we booked": "Game details are true",
};
const ruleOf = (reason, adv = false) => (adv ? BOOKING_RULE[reason] ?? "—" : ruleForReason(reason));
const OUT_TEXT = (r) => (r.status === "removed" ? "Creative blocked for a violation · bookings unchanged · both sides notified" : r.status === "changes" ? "Advertiser asked to change it · not shown until a new version is approved · both sides notified" : r.status === "paused" ? "Booking paused · creative stays · both sides notified" : r.status === "dismissed" ? (r.initiator === "advertiser" ? "Dismissed · both sides notified" : "No violation found · developer notified") : "");
export const outcomeText = OUT_TEXT;

/** The "Now:" line of a dispute card (the mockup's dNow). */
export function disputeNow(r, extra = {}) {
  const adv = r.initiator === "advertiser";
  if (r.open) return adv ? "Open. The booking keeps running while you decide." : "Open. The creative keeps running while you decide.";
  const talk = r.waiting ? " The advertiser wrote and waits for an answer." : "";
  const what = r.shape ? "picture" : "creative";
  if (r.status === "removed") return `The ${what} is blocked on the platform for a violation.${r.shape ? " The creative’s other shapes keep running." : ""}${talk}`;
  if (r.status === "changes") return (r.resent ? `Change requested. A new ${what === "picture" ? "picture" : "version"} was uploaded and waits for review.` : r.held === "changes" ? `Change requested. The ${what} is not shown in any game${r.shape ? "; the creative’s other shapes keep running" : ""}. No new ${what === "picture" ? "picture" : "version"} has been uploaded.` : `Change requested. A new ${what === "picture" ? "picture" : "version"} was approved and runs again.`) + talk;
  if (r.status === "paused") return `Booking paused in ${r.game}. Waiting for the developer to fix the placement.`;
  return adv ? "Dismissed. The booking keeps running." : "No violation found. The creative keeps running.";
}

/**
 * The history of one dispute, oldest first (the mockup's d.ev with the details evX gives a step):
 * [{ kind, who, text, when, at, facts: [[label, value, link?]], bookingLink? }].
 * `replies` are dispute_events of kind reply or note; `ctx` = { booking, creative, devEmail, advEmail }.
 */
export function disputeEvents(r, replies = [], ctx = {}) {
  const adv = r.initiator === "advertiser";
  const bk = ctx.booking ?? null;
  const cr = ctx.creative ?? {};
  const bookingFact = bk ? [["Booking", `${bk.campaign || "Booking"}${bk.from ? ` · ${fdt(bk.from)} to ${bk.to ? fdt(bk.to) : "open end"}` : ""}`, { card: "booking", id: bk.id }]] : [["Booking", "—"]];
  const ev = [];
  const stamp = (iso) => (iso ? `${fdtTime(iso)} UTC` : "");

  ev.push({
    kind: adv ? "adv" : "report", who: r.by, at: r.createdAt, when: stamp(r.createdAt), bookingId: bk?.id ?? null,
    text: adv ? `Reported booking in ${r.game}: ${r.reason}` : `Reported in ${r.game}: ${r.reason}`,
    facts: [
      ["Reason", r.reason],
      ["Comment", r.comment || `${adv ? "The advertiser" : "The developer"} left no comment`],
      ["Rule involved", ruleOf(r.reason, adv)],
      adv ? ["Reported by", `Advertiser ${r.adv}${ctx.advEmail ? ` · ${ctx.advEmail}` : ""}`] : ["Reported by", `Developer ${r.dev}${ctx.devEmail ? ` · ${ctx.devEmail}` : ""}`],
      adv ? ["Against", `${r.game} · developer ${r.dev}`] : ["Where", r.game],
      [bk?.placement?.includes(", ") ? "Placements" : "Placement", bk?.placement ?? "—"],
      ...bookingFact,
      ["Impressions so far", bk?.impressions != null ? `${spaced(bk.impressions)} impressions${bk.earned != null ? ` · ${credits(bk.earned)} C. earned by the developer` : ""}` : "—"],
      ["Creative", `${r.picture ?? r.creative}${cr.size ? ` · ${cr.size}` : ""}${cr.date ? ` · uploaded ${fdt(cr.date)}` : ""}`],
      ...(!adv && ctx.others ? [["Other games", ctx.others]] : []),
    ],
  });
  ev.push({
    kind: "sys", who: "System", at: r.createdAt, when: stamp(r.createdAt), bookingId: null,
    text: "Review team notified",
    facts: [["Sent to", "Review team"], ["Also sent to", adv ? `${r.dev}${ctx.devEmail ? ` · ${ctx.devEmail}` : ""}` : `${r.adv}${ctx.advEmail ? ` · ${ctx.advEmail}` : ""}`], ["Channel", "Cabinet + email"]],
  });
  for (const x of replies) {
    if (x.kind === "decision") {
      const [, was = ""] = /^withdrawn: (.*)$/.exec(x.text) ?? [];
      ev.push({ kind: "ok", who: "DeusADS admin", at: x.created_at, when: stamp(x.created_at), text: "Took the decision back. The creative is approved and runs again", facts: [["Decision taken back", was || "—"], ["Decided by", "DeusADS admin"], ["Effect", "Creative approved again. It runs where it ran before"], ["Notified", "Advertiser and developer"]] });
    } else if (x.side === "admin" && x.kind === "reply") {
      ev.push({ kind: "admin", who: "DeusADS admin", at: x.created_at, when: stamp(x.created_at), text: `Replied to the advertiser: ${x.text}`, facts: [["From", "DeusADS admin"], ["To", `${r.adv}${ctx.advEmail ? ` · ${ctx.advEmail}` : ""}`], ["Message", x.text]] });
    } else if (x.kind === "note") {
      ev.push({ kind: "note", who: "DeusADS admin", at: x.created_at, when: stamp(x.created_at), text: `Internal note added: ${x.text}`, facts: [["Author", "DeusADS admin"], ["Visible to", "Admins only"], ["Note", x.text]] });
    } else {
      const side = x.side === "advertiser" ? "adv" : "dev";
      const email = side === "adv" ? ctx.advEmail : ctx.devEmail;
      ev.push({ kind: side, who: x.who, at: x.created_at, when: stamp(x.created_at), text: `Replied: ${x.text}`, facts: [["From", `${x.who}${email ? ` · ${email}` : ""}`], ["Message", x.text]] });
    }
  }
  if (!r.open) {
    const removed = r.status === "removed", paused = r.status === "paused", changes = r.status === "changes";
    const based = [removed ? "Rule broken" : changes ? "Rule involved" : "Based on", r.rule || ruleOf(r.reason, adv)];
    const toDeveloper = ["To the developer", r.devNote || "No message: the developer reads the outcome only"];
    ev.push({
      kind: removed || paused || changes ? "bad" : "ok", who: "DeusADS admin", at: r.resolvedAt, when: stamp(r.resolvedAt),
      text: removed ? `Blocked the ${r.shape ? "picture" : "creative"} for a violation. Bookings unchanged` : changes ? `Asked the advertiser to change the ${r.shape ? "picture" : "creative"}` : paused ? `Paused the booking in ${r.game}. The creative stays on the platform` : adv ? "Dismissed the report" : "Found no violation",
      facts: paused
        ? [["Decision", "Booking paused"], ["Decided by", "DeusADS admin"], based, ["Effect", `Nothing is shown in ${r.game} for this booking. The creative stays on the platform`], ["Notified", "Advertiser and developer"]]
        : adv
          ? [["Decision", "Report dismissed"], ["Decided by", "DeusADS admin"], based, ["Effect", `The booking keeps running in ${r.game}`], ["Developer", `${r.dev} is notified`]]
          : removed || changes
            ? [["Decision", removed ? "Block the creative" : "Ask to change it"], ["Decided by", "DeusADS admin"], based, ["To the advertiser", r.advNote || "—"], toDeveloper, ["Effect", r.shape ? (removed ? "This picture leaves the platform for good; the creative’s other shapes keep running. Bookings stay as they are" : "This picture is not shown in any game until a new one is approved; the creative’s other shapes keep running. Bookings stay as they are") : removed ? "Creative leaves the platform for good. Bookings stay as they are" : "Creative is not shown in any game until a new version is approved. Bookings stay as they are"]]
            : [["Decision", "No violation"], ["Decided by", "DeusADS admin"], toDeveloper, ["Effect", `Creative keeps running. Showing it in ${r.game} stays the developer’s choice`]],
    });
    const both = adv || removed || changes;
    ev.push({
      kind: "sys", who: "System", at: r.resolvedAt, when: stamp(r.resolvedAt),
      text: adv ? "Advertiser and developer notified" : both ? "Developer and advertiser notified" : "Developer notified",
      facts: [["Sent to", both ? `${r.dev}${ctx.devEmail ? ` · ${ctx.devEmail}` : ""}; ${r.adv}${ctx.advEmail ? ` · ${ctx.advEmail}` : ""}` : `${r.dev}${ctx.devEmail ? ` · ${ctx.devEmail}` : ""}`], ["Channel", "Cabinet + email"], ["Contains", removed || changes ? "Outcome, the rule and your message" : "Outcome and the short reason"]],
    });
  }
  return ev.map((e, i) => ({ ...e, i })).sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity) || a.i - b.i).map(({ i, ...e }) => e);
}

export const DISPUTE_GROUPS = [["rep", "Who reports"], ["tgt", "Who is reported"], ["dec", "Decisions"], ["trend", "Trends and fixes"]];
export const DISPUTE_DEFAULTS = ["topRep", "tgtAdv", "outcome", "ttd", "weekly", "reasons"];

/**
 * The board of the Disputes screen: the mockup's catalog, in its order. Figures cover the last 90 days.
 * Rows carry `dev` and `adv` (the two sides whoever reported), `reuploaded` / `reapproved` (what the advertiser did after a removal).
 */
export function disputeWidgets(all) {
  const rows = all.filter((r) => r.age < 90);
  const fromDev = rows.filter((r) => r.initiator === "developer");
  const fromAdv = rows.filter((r) => r.initiator === "advertiser");
  const done = rows.filter((r) => !r.open);
  const hrs = done.map((r) => r.hours).filter((h) => h != null && h > 0);
  const open = rows.filter((r) => r.open);
  const oldest = Math.max(0, ...open.map((r) => r.waitingHours ?? 0));
  const only = " Counts reports from developers only.";
  const removed = rows.filter((r) => r.status === "removed");
  const re = removed.filter((r) => r.reuploaded);
  const ok = re.filter((r) => r.reapproved);

  const dismissedShare = new Map();
  for (const r of fromDev.filter((x) => !x.open)) {
    const v = dismissedShare.get(r.dev) ?? [0, 0];
    v[0] += 1;
    if (r.status === "dismissed") v[1] += 1;
    dismissedShare.set(r.dev, v);
  }
  const rate = new Map();
  for (const r of rows.filter((x) => !x.open)) {
    const v = rate.get(r.reason) ?? [0, 0];
    v[0] += 1;
    if (r.status === "removed" || r.status === "paused" || r.status === "changes") v[1] += 1;
    rate.set(r.reason, v);
  }
  const repeat = countBy(fromDev.filter((r) => r.status === "removed"), (r) => r.adv).filter((x) => x[1] >= 2).slice(0, 5);

  return [
    { k: "topRep", g: "rep", t: "Developers who report most", w: 6, info: `Developers ranked by how many reports they filed in the last 90 days.${only}`, data: bars(countBy(fromDev, (r) => r.dev).slice(0, 5)) },
    { k: "repDis", g: "rep", t: "Reports mostly dismissed", w: 6, info: `Share of a developer's decided reports that you dismissed. Shown for developers with at least 4 decided reports. A high share can mean they report ads that follow the rules.${only}`, data: bars([...dismissedShare].filter(([, v]) => v[0] >= 4).map(([k, v]) => [k, v[1] / v[0], `${Math.round((v[1] / v[0]) * 100)}% of ${v[0]}`]).sort((x, y) => y[1] - x[1]).slice(0, 5), GREY) },
    { k: "repGame", g: "rep", t: "Games with most reports", w: 6, info: `Games where creatives were reported most often.${only}`, data: bars(countBy(fromDev, (r) => r.game).slice(0, 5)) },
    { k: "dir", g: "rep", t: "Who files reports", w: 4, info: "Share of reports filed by developers and by advertisers.", data: ring([["Developers", fromDev.length, BLUE], ["Advertisers", fromAdv.length, ORANGE]]) },
    { k: "advRep", g: "rep", t: "Advertisers who report most", w: 6, info: "Advertisers who filed the most reports about where their ads are shown.", data: bars(countBy(fromAdv, (r) => r.adv).slice(0, 5), ORANGE) },
    { k: "tgtAdv", g: "tgt", t: "Most reported advertisers", w: 6, info: `Advertisers whose creatives were reported most often, whatever the outcome.${only}`, data: bars(countBy(fromDev, (r) => r.adv).slice(0, 5)) },
    { k: "tgtCre", g: "tgt", t: "Most reported creatives", w: 6, info: `Single creatives with the most reports.${only}`, data: bars(countBy(fromDev, (r) => r.creative).slice(0, 5)) },
    { k: "tgtCat", g: "tgt", t: "Reports by ad category", w: 6, info: `Which ad categories attract reports.${only}`, data: bars(countBy(fromDev, (r) => r.categoryLabel).slice(0, 6)) },
    { k: "repeat", g: "tgt", t: "Repeat offenders", w: 6, info: `Advertisers whose creatives were removed more than once. Candidates for a closer look or a warning.${only}`, data: repeat.length ? bars(repeat, RED) : note("Nobody has two or more removals yet.") },
    { k: "tgtGame", g: "tgt", t: "Games advertisers complain about", w: 6, info: "Games that advertisers reported most often.", data: bars(countBy(fromAdv, (r) => r.game).slice(0, 5), BLUE) },
    { k: "tgtDev", g: "tgt", t: "Developers advertisers complain about", w: 6, info: "Developers whose games advertisers reported most often.", data: bars(countBy(fromAdv, (r) => r.dev).slice(0, 5), BLUE) },
    { k: "outcome", g: "dec", t: "Outcomes", w: 4, info: "How reports ended: creative blocked, a change requested, booking paused, no violation found, or still waiting for a decision.", data: ring([["Blocked", removed.length, RED], ["Change requested", rows.filter((r) => r.status === "changes").length, ORANGE], ["Booking paused", rows.filter((r) => r.status === "paused").length, AMBER], ["No violation", rows.filter((r) => r.status === "dismissed").length, GREY], ["Open", open.length, "#e0a21a"]]) },
    { k: "rate", g: "dec", t: "Action rate by reason", w: 6, info: "Of the decided reports for each reason, how many ended with a creative blocked, a change requested or a booking paused.", data: bars([...rate].map(([k, v]) => [k, v[0] ? v[1] / v[0] : 0, `${Math.round((v[0] ? v[1] / v[0] : 0) * 100)}% of ${v[0]}`]).sort((x, y) => y[1] - x[1]).slice(0, 6), RED) },
    { k: "ttd", g: "dec", t: "Time to decision", w: 4, info: "From the report to your decision. Slowest 10% means nine out of ten reports were decided faster than this.", data: stats([["Median", hrs.length ? hours(median(hrs)) : "—"], ["Slowest 10%", hrs.length ? hours(percentile(hrs, 0.9)) : "—"], ["Decided", hrs.length]]) },
    { k: "openNow", g: "dec", t: "Waiting now", w: 4, info: "Reports without a decision. The oldest one shows how long a developer has been waiting.", data: stats([["Open", open.length], ["Oldest waiting", hours(oldest), oldest > 48]]) },
    { k: "weekly", g: "trend", t: "Reports per week", w: 8, info: "New reports in each of the last 13 weeks.", data: cols(weekly(rows, (r) => r.age)) },
    { k: "reasons", g: "trend", t: "Reasons for reports", w: 6, info: "Reason the developer picked when reporting.", data: bars(countBy(rows, (r) => r.reason)) },
    { k: "fix", g: "trend", t: "After removal", w: 6, info: "What happened next to removed creatives: did the advertiser upload a new version, and was it approved.", data: funnel([["Removed", removed.length, RED], ["New version uploaded", re.length, ORANGE], ["New version approved", ok.length, GREEN]]) },
  ];
}
