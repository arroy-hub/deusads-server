"use client";

// What the impressions earned, for the Performance tabs of a game and of My games: the Earned block above the
// impressions, the switch of the chart and the row of its tooltip. The figures come from the wallet's books
// (lib/performance-earnings.js); the rules (rate, the developer's part, what could have been earned) are in lib/wallet.js.

import { DEV_SHARE, RATE, count, credits, earnedOf, potentialOf } from "../../lib/wallet";
import { Info } from "./metrics-deck";
import { TestMark } from "./wallet/parts";

/** "12.40 C.": what this many paid impressions earned the developer. */
export const earnedText = (paid) => `${credits(earnedOf(paid))} C.`;

const EARNED_HINT = `What this selection earned in the period. Your rate is ${credits(RATE * DEV_SHARE)} C. per 1,000 paid impressions: the advertiser pays ${credits(RATE)} C. and you keep ${Math.round(DEV_SHARE * 100)}%. Paid impressions are the impressions of advertisers’ creatives. Your own creatives and chances to be seen are not paid.`;
const POTENTIAL_HINT = "What this selection would have earned if an advertiser’s creative had filled every impression: also the ones that showed your own creatives and the slots that stayed empty. Empty slots are counted as if each had been seen as often as a filled one.";

/** The Potential strip: what was earned beside what the same impressions and the empty slots could have earned. */
function Potential({ cell, missed }) {
  const pot = potentialOf({ paid: cell.paid, adv: cell.adv, own: cell.own, missed });
  const all = cell.adv + cell.own;
  const width = (value) => `${pot.full > 0 ? ((value / pot.full) * 100).toFixed(2) : 0}%`;
  return (
    <div className="pm-pot">
      <div className="pm-pot-head">
        <span className="pm-pot-title">Potential <Info title="Potential" text={POTENTIAL_HINT} /></span>
        <span>With every slot filled by advertisers: <b>{credits(pot.full)} C.</b></span>
        <span className="pm-pot-got">you earned <b>{Math.round(pot.share)}%</b> of it</span>
      </div>
      <div className="pm-pot-bar" role="img" aria-label={`Earned ${credits(pot.earned)} C. of ${credits(pot.full)} C. possible`}>
        <i className="is-earned" style={{ width: width(pot.earned) }} />
        <i className="is-own" style={{ width: width(pot.own) }} />
        {pot.other > 0 && <i className="is-other" style={{ width: width(pot.other) }} />}
        <i className="is-empty" style={{ width: width(pot.empty) }} />
      </div>
      <ul className={`pm-pot-list${pot.other > 0 ? " is-four" : ""}`}>
        <li>
          <i className="is-earned" /><span>Earned</span><b>{credits(pot.earned)} C.</b>
          <small>{count(cell.paid)} paid impressions · {all > 0 ? Math.round((cell.paid / all) * 100) : 0}% of all impressions</small>
        </li>
        <li>
          <i className="is-own" /><span>Not earned: your own creatives</span><b>{credits(pot.own)} C.</b>
          <small>{count(cell.own)} impressions that are not paid</small>
        </li>
        {pot.other > 0 && (
          <li>
            <i className="is-other" /><span>Not earned: no campaign paid</span><b>{credits(pot.other)} C.</b>
            <small>{count(pot.otherImpressions)} advertisers’ impressions outside a paying campaign</small>
          </li>
        )}
        <li>
          <i className="is-empty" /><span>Not earned: empty slots</span><b>{credits(pot.empty)} C.</b>
          <small>about {count(pot.emptyImpressions)} impressions missed</small>
        </li>
      </ul>
    </div>
  );
}

/**
 * The Earned block. It does not follow the Impressions switch: only advertisers' impressions are paid.
 *   cell    the figures of the selection (adv, own, paid, gameSessions)
 *   days    the chart's days ([{ date, paid }])
 *   missed  impressions the empty slots would have had
 *   tail    "last 30 days · 5 of 5 placements"          dayLabel  how a day is written on this page
 */
export function EarnedBlock({ cell, days, missed = 0, tail, dayLabel }) {
  const all = cell.adv + cell.own;
  const earned = earnedOf(cell.paid);
  let best = null;
  for (const day of days) if ((day.paid ?? 0) > (best ? best.paid : 0)) best = day;
  const stats = [
    ["Per day", days.length > 0 ? `${credits(earned / days.length)} C.` : "—", "on average"],
    ["Best day", best ? earnedText(best.paid) : "—", best ? dayLabel(best.date) : "no paid impressions yet"],
    ["Earned per 1,000 impressions", all > 0 ? `${credits((earned / all) * 1000)} C.` : "—", "paid and unpaid together"],
    ["Earned per 1,000 sessions", cell.gameSessions > 0 ? `${credits((earned / cell.gameSessions) * 1000)} C.` : "—", cell.gameSessions > 0 ? "game sessions" : "needs SDK 0.10 or newer"],
  ];
  return (
    <section className="pm-earnbox" aria-label="Earnings">
      <div className="pm-eb-main">
        <span className="cr-hero-label">Earned <Info title="Earned" text={EARNED_HINT} /><TestMark /></span>
        <div className="cr-hero-value">{credits(earned)}<small>C.</small></div>
        <div className="cr-hero-delta"><span>{tail}</span></div>
      </div>
      <div className="pm-eb-side">
        <dl className="pm-eb-stats">
          {stats.map(([label, value, sub]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{sub}</small></div>
          ))}
        </dl>
      </div>
      <Potential cell={cell} missed={missed} />
    </section>
  );
}

/** Impressions or Earnings: what the chart draws. */
export function MetricSwitch({ value, onChange }) {
  return (
    <div className="cr-tabs pm-metric" role="tablist" aria-label="What the chart shows">
      <button type="button" role="tab" aria-selected={value !== "earn"} onClick={() => onChange("imps")}>Impressions</button>
      <button type="button" role="tab" aria-selected={value === "earn"} onClick={() => onChange("earn")}>Earnings</button>
    </div>
  );
}

/** The row of a chart tooltip that says what the day earned. */
export function EarnedTipRow({ paid }) {
  return (
    <div className="pf-tip-row pm-tip-earn">
      <span className="pf-tip-key pm-key-coin" aria-hidden="true" />
      <span className="pf-tip-val">{earnedText(paid)}</span>
      <span className="pf-tip-label">Earned</span>
    </div>
  );
}
