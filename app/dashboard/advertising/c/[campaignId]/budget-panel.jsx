"use client";

// The budget of a campaign on its Report tab (migration 0061): what it may spend, what it has spent and what is left,
// a warning when the budget is used up, and what it spent each day.

import { useState } from "react";
import { PRICE, RATE, budgetTone, count, credits, lastsAbout } from "../../../../../lib/wallet";
import { Bar, BudgetDialog, Hint, MoneyChart } from "../../../wallet/parts";

const WarnIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5h.01M12 3l9.5 17h-19z" /></svg>
);

/**
 *   campaign   { id, name }        state   the budget as budgetOf gives it        ended   the campaign is over
 *   statusLabel  the campaign's status word, shown once it is over
 *   available  credits in the wallet       spend   [{ day, impressions, amount }] of the last 30 days, oldest first
 */
export default function BudgetPanel({ campaign, state, ended, statusLabel, available, spend }) {
  const [adding, setAdding] = useState(false);
  const closed = ended || state.closed;
  const out = state.out && !closed;
  // what the seven full days before today spent: how long the rest lasts at that pace
  const week = spend.slice(-8, -1).reduce((sum, day) => sum + day.amount, 0);
  const lasts = closed || out ? null : lastsAbout(state.left, week);
  const days = spend.map((day) => day.day);
  const rows = spend.map((day) => ({ value: day.amount, impressions: day.impressions }));

  return (
    <>
      {out ? (
        <div className="wl-alert">
          <span><WarnIcon /></span>
          <div><b>This campaign has stopped: the budget is used up.</b><span>Add budget and it starts showing again by itself. Players see the change the next time their game refreshes its ads.</span></div>
          <button type="button" className="button" onClick={() => setAdding(true)}>Add budget</button>
        </div>
      ) : null}

      {state.unlimited ? (
        <section className="gp-panel wl-budget">
          <div className="wl-bhead"><h2>Budget</h2><span className="pill">No limit</span></div>
          <p className="muted wl-p">This campaign was created before budgets existed. It runs without a limit and does not take credits from your wallet. Spent so far: <b>{credits(state.spent)}</b> C.</p>
        </section>
      ) : (
        <section className="gp-panel wl-budget">
          <div className="wl-bhead">
            <h2>Budget</h2>
            <Hint title="Budget" text={`The total this campaign may spend. It is reserved in your wallet when the campaign starts. ${credits(RATE)} C. are taken per 1,000 impressions.`} />
            <span className="wl-spacer" />
            {closed ? null : <button type="button" className="button button-quiet wl-sm" onClick={() => setAdding(true)}>Add budget</button>}
          </div>
          <div className="wl-bgrid">
            <div><span className="cr-card-label">Spent</span><b>{credits(state.spent)}</b></div>
            <div><span className="cr-card-label">{closed ? "Returned to wallet" : "Left"}</span><b>{credits(closed ? state.returned : state.left)}</b></div>
            <div><span className="cr-card-label">Budget</span><b>{credits(state.budget)}</b></div>
            <div><span className="cr-card-label">{closed ? "Status" : "Lasts about"}</span><b>{closed ? statusLabel : lasts ?? "–"}</b></div>
          </div>
          <div className="wl-bigbar"><Bar pct={state.pct} tone={budgetTone({ ...state, out })} /></div>
          <p className="muted wl-p">{Math.round(state.pct)}% used · {count(Math.round(state.spent / PRICE))} paid impressions{lasts ? " · at the pace of the last 7 days" : ""}</p>
        </section>
      )}

      <MoneyChart title="Spending per day" tools={<span className="ovx-hint">last 30 days</span>} days={days} rows={rows} what="Spent" />
      <BudgetDialog campaign={adding ? { id: campaign.id, name: campaign.name, budget: state } : null} onClose={() => setAdding(false)} available={available} />
    </>
  );
}
