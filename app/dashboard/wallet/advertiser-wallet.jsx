"use client";

// The advertiser's Wallet window: what can be spent, the latest operations beside it, the budget of every campaign
// below, and the whole history on its own tab.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WindowTop, { PlateIcon } from "../window-top";
import { RATE, budgetTone, count, credits, creditNote, dayText } from "../../../lib/wallet";
import { TONE } from "../_cabinet/dates";
import { Amount, Bar, BudgetDialog, HeroAmount, Hint, TableBox, TestMark, TopUpDialog } from "./parts";

const campaignHref = (id) => `/dashboard/advertising/c/${id}`;
const FILTERS = [["all", "All"], ["topup", "Top-ups"], ["budget", "Budgets"], ["spend", "Spending"]];
const PlusIcon = ({ size = 16, width = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);

/** When a campaign runs: "31 Oct – running", "25 Oct – 3 Nov", "12 Nov – waiting for budget". */
function runText(campaign) {
  const from = campaign.starts ? dayText(campaign.starts) : "";
  const key = campaign.status.key;
  const tail = key === "ended" ? (campaign.ends ? dayText(campaign.ends) : "ended") : key === "budget" ? "waiting for budget" : key === "scheduled" || key === "waiting" ? "not started yet" : key === "paused" ? "paused" : "running";
  return from ? `${from} – ${tail}` : tail;
}

export default function AdvertiserWallet({ wallet, campaigns, initialTab = "overview", openTopUp = false }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(openTopUp);
  const [budgetFor, setBudgetFor] = useState(null);
  const tabs = useRef({});
  const nameOf = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  function choose(next, focus = false) {
    setTab(next);
    try { window.history.replaceState(window.history.state, "", next === "history" ? "?tab=history" : window.location.pathname); } catch {}
    window.scrollTo(0, 0);
    if (focus) tabs.current[next]?.focus();
  }
  const onKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    choose(tab === "history" ? "overview" : "history", true);
  };

  const campaignLink = (id, fallback) => (nameOf.has(id) ? <Link href={campaignHref(id)}>{nameOf.get(id)}</Link> : fallback || "a deleted campaign");
  /** The tag and the words of an operation; `long` is the History wording. */
  const describe = (op, long = false) => {
    if (op.kind === "topup") return ["Top-up", "wl-k-top", "Credits added"];
    if (op.kind === "reserve") return ["Budget", "wl-k-res", <>Reserved for {campaignLink(op.campaignId, op.campaignName)}</>];
    if (op.kind === "return") return ["Return", "wl-k-ret", <>{long ? "Unspent budget returned from" : "Returned from"} {campaignLink(op.campaignId, op.campaignName)}</>];
    return ["Spending", "wl-k-sp", <>{campaignLink(op.campaignId, "")} · {count(op.impressions)} impressions</>];
  };

  const hero = (
    <HeroAmount
      label={<>Available <Hint title="What is a credit?" text={creditNote("pay")} /></>}
      value={credits(wallet.available)}
      sub="credits you can put into campaigns"
      extra={<button type="button" className="wl-plus" onClick={() => setAdding(true)} aria-label="Add credits" title="Add credits"><PlusIcon size={17} width={2.8} /></button>}
      after={<span className="wl-hero-rate"><b>{credits(RATE)} C.</b> per 1,000 impressions <Hint title="How impressions are priced" text="One price for every campaign, set by DeusADS. An impression costs 0.006 C. The price does not change how often your ad is shown." /></span>}
    />
  );
  const cells = [
    ["Reserved in campaigns", credits(wallet.reserved), "budgets not spent yet"],
    ["Spent · all time", credits(wallet.spent), `${count(wallet.impressions)} impressions`],
    ["Spent today", credits(wallet.spentToday), `${count(wallet.impressionsToday)} impressions`],
  ];

  const overview = (
    <>
      <div className="wl-lay wl-layA">
        <section className="wl-hero wl-hero-solo">
          <div className="wl-hero-main">{hero}</div>
          <dl className="wl-hero-strip">{cells.map(([label, value, caption]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{caption}</small></div>)}</dl>
        </section>
        <section className="gp-panel wl-ops">
          <div className="wl-bhead"><h2>Latest operations</h2><span className="wl-spacer" /><button type="button" className="link-button" onClick={() => choose("history")}>See all</button></div>
          {wallet.ops.length ? (
            <ul>
              {wallet.ops.slice(0, 4).map((op) => {
                const [tag, cls, text] = describe(op);
                return <li key={op.id}><span className={`wl-kind ${cls}`}>{tag}</span><div><b>{text}</b><small>{dayText(op.at)}</small></div><Amount value={op.amount} /></li>;
              })}
            </ul>
          ) : <p className="wl-empty">Nothing yet. Add credits to start a campaign.</p>}
        </section>
      </div>
      <TableBox
        title="Campaign budgets"
        tools={<Link href="/dashboard/advertising/new" className="button button-with-icon"><PlusIcon />New campaign</Link>}
        head={[["Campaign"], ["Budget", true], ["Spent", true], ["Left", true], ["Progress"], [""]]}
        note={<p className="wl-foot">A campaign stops by itself when its budget runs out and starts again as soon as you add budget. Stopping or deleting a campaign returns what is left to your wallet.</p>}
      >
        {campaigns.map((campaign) => {
          const state = campaign.budget;
          const over = campaign.status.key === "ended" || state.closed;
          const tone = TONE[campaign.status.key] ?? "#8c7f73";
          return (
            <tr key={campaign.id} className="wl-row" onClick={(event) => { if (!event.target.closest("a, button")) router.push(campaignHref(campaign.id)); }}>
              <td><span className="wl-cname"><i className="wl-cpic" style={{ background: campaign.coverCss }} /><span><b><Link href={campaignHref(campaign.id)} className="wl-plain">{campaign.name}</Link></b><small><em style={{ color: tone }}>{campaign.status.label}</em> · {runText(campaign)}</small></span></span></td>
              <td className="num">{state.unlimited ? <><span className="pill">No limit</span> <Hint title="No limit" text="This campaign was created before budgets existed, so it runs without a limit and does not take credits from your wallet." /></> : credits(state.budget)}</td>
              <td className="num">{credits(state.spent)}</td>
              <td className="num">{state.unlimited ? "–" : over ? <span className="muted">{credits(state.returned)} returned</span> : <b>{credits(state.left)}</b>}</td>
              <td className="wl-barcell">{state.unlimited ? null : <><Bar pct={state.pct} tone={budgetTone(state)} /><small>{Math.round(state.pct)}% used</small></>}</td>
              <td className="wl-actcell">{!state.unlimited && !over ? <button type="button" className="button button-quiet wl-sm" onClick={() => setBudgetFor(campaign)}>Add budget</button> : null}</td>
            </tr>
          );
        })}
        {campaigns.length === 0 ? <tr><td colSpan={6} className="wl-none">No campaigns yet. A campaign gets its budget when you start it.</td></tr> : null}
      </TableBox>
    </>
  );

  // History: the wallet's operations, and what each campaign spent a day (taken from its reserved budget).
  const spendRows = wallet.spend.filter((row) => row.impressions > 0).map((row) => ({ id: `s:${row.day}:${row.campaignId}`, kind: "spend", campaignId: row.campaignId, impressions: row.impressions, amount: -row.amount, at: `${row.day}T23:59:59Z`, day: row.day }));
  let history = wallet.ops.map((op) => ({ ...op, day: String(op.at).slice(0, 10) }));
  if (filter === "all" || filter === "spend") history = history.concat(spendRows);
  if (filter === "topup") history = history.filter((op) => op.kind === "topup");
  if (filter === "budget") history = history.filter((op) => op.kind === "reserve" || op.kind === "return");
  if (filter === "spend") history = history.filter((op) => op.kind === "spend");
  history.sort((a, b) => (a.day === b.day ? (a.kind === "spend") - (b.kind === "spend") || String(b.at).localeCompare(String(a.at)) : b.day.localeCompare(a.day)));

  const historyTab = (
    <TableBox
      title="History"
      className="wl-histbox"
      tools={<div className="cr-tabs" role="tablist" aria-label="Show">{FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>}
      head={[["Date"], ["Operation"], ["Amount", true]]}
      note={<p className="wl-foot">Spending is taken from a campaign’s reserved budget, so it does not change the Available figure. Daily spending is shown for the last 10 days.</p>}
    >
      {history.map((op) => {
        const [tag, cls, text] = describe(op, true);
        return (
          <tr key={op.id}>
            <td className="wl-date">{dayText(op.day)}</td>
            <td><span className={`wl-kind ${cls}`}>{tag}</span> {text}</td>
            <td className="num">{op.kind === "spend" ? <span className="wl-amt is-budget">−{credits(Math.abs(op.amount))}</span> : <Amount value={op.amount} />}</td>
          </tr>
        );
      })}
      {history.length === 0 ? <tr><td colSpan={3} className="wl-none">Nothing here yet.</td></tr> : null}
    </TableBox>
  );

  return (
    <div className="gp">
      <WindowTop title="Wallet" titleExtra={<TestMark />} sub="Credits you add here pay for impressions in your campaigns." icon={<PlateIcon name="wallet" />}>
        <div className="tabs" role="tablist" aria-label="Wallet sections" onKeyDown={onKeyDown}>
          {[["overview", "Overview"], ["history", "History"]].map(([key, label]) => (
            <button key={key} type="button" ref={(el) => { tabs.current[key] = el; }} className="tab" role="tab" aria-selected={tab === key} aria-current={tab === key ? "page" : undefined} tabIndex={tab === key ? 0 : -1} onClick={() => choose(key)}>{label}</button>
          ))}
        </div>
      </WindowTop>
      <div className="gp-work">{tab === "overview" ? overview : historyTab}</div>
      <TopUpDialog open={adding} onClose={() => setAdding(false)} available={wallet.available} />
      <BudgetDialog campaign={budgetFor} onClose={() => setBudgetFor(null)} available={wallet.available} />
    </div>
  );
}
