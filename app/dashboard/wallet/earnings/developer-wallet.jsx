"use client";

// The developer's Wallet window: the balance, what the games earned per day (the ticks in "By game" choose the lines of
// the chart), the same by game and by campaign, and a history of one line per game per day.

import { useSamePage } from "../../same-page";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WindowTop, { PlateIcon } from "../../window-top";
import { Figure, useWaitMark } from "../../wait";
import Modal from "../../modal";
import CategoryIcon from "../../advertising/category-icon";
import { categoryLabel } from "../../../../lib/categories";
import { campaignDetails } from "../actions";
import { DEV_SHARE, RATE, count, credits, creditNote, dayText, earnedOf, payoutPlan } from "../../../../lib/wallet";
import { Amount, Bar, BlockHead, HeroAmount, HistoryPeriod, Hint, MoneyChart, PeriodPick, TableBox, TestMark, historyRange } from "../parts";

const TOTAL = "total";
const TOTAL_LINE = { color: "#c94a24", tint: "#f0b293" };
// A line colour for each game (and the lighter tone its name takes on the dark tooltip), in the order of the games.
const GAME_LINES = [
  ["#7a4bd6", "#c4a6f5"], ["#d6792b", "#f0b27f"], ["#2f8f6b", "#8fd6b8"], ["#3a7bd5", "#a8c8f2"],
  ["#c2416b", "#eea4bd"], ["#4a9c2f", "#b2dc9f"], ["#8a6d1f", "#dcc784"], ["#3f8f96", "#a5d6da"],
];
const STATUS_TONE = { live: "#1b8a50", paused: "#c98a14", budget: "#c98a14", ended: "#8c7f73" };
const PERIODS = [7, 30, 90];
const sum = (list) => list.reduce((total, value) => total + value, 0);

function GameBadge({ game }) {
  if (game.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="rail-game-icon wl-gic" src={game.iconUrl} alt="" width="34" height="34" />;
  }
  return <span className="rail-game-icon is-empty wl-gic" style={{ background: game.color, color: "#fff" }} aria-hidden="true">{game.name.trim().charAt(0).toUpperCase() || "?"}</span>;
}

/** One campaign as the developer sees it: who runs it, and how each creative and picture did in their games. */
export function CampaignDetails({ d }) {
  const most = Math.max(1, ...d.creatives.flatMap((creative) => creative.pictures.map((picture) => picture.impressions)));
  return (
    <div className="wl-cd">
      <dl className="wl-cd-facts">
        <div><dt>Advertiser</dt><dd>{d.advertiser}</dd></div>
        <div><dt>Category</dt><dd><span className="wl-cd-cat"><span className="rd-tile wl-ctile"><CategoryIcon category={d.category} label="" /></span>{d.category ? categoryLabel(d.category) : "Not set"}</span></dd></div>
        <div><dt>Now</dt><dd>{d.status.label}</dd></div>
        <div><dt>In your games since</dt><dd>{dayText(d.since)}</dd></div>
        {d.audience && <div className="is-wide"><dt>Audience it asked for</dt><dd>{d.audience}</dd></div>}
      </dl>
      <div className="wl-cd-sum">
        <div><b>{count(d.total.impressions)}</b><span>paid impressions · last {d.days} days</span></div>
        <div><b>{credits(earnedOf(d.total.impressions))} C.</b><span>you earned</span></div>
        <div><b>{d.total.placements}</b><span>{d.total.placements === 1 ? "placement" : "placements"} in {d.games.length} {d.games.length === 1 ? "game" : "games"}</span></div>
      </div>
      {d.best && <p className="wl-cd-best"><b>What players saw most:</b> {d.best.creative} in {d.best.label}, {count(d.best.perPlacement)} paid impressions per placement.</p>}
      {d.creatives.length === 0 ? <p className="wl-none">Nothing was paid in these {d.days} days.</p> : (
        <div className="wl-cd-list">
          {d.creatives.map((creative) => (
            <section key={creative.id} className="wl-cd-cr">
              <h3>{creative.name}<span>{count(creative.impressions)} paid impressions · {credits(earnedOf(creative.impressions))} C.</span></h3>
              {creative.pictures.map((picture) => (
                <div key={picture.shape} className="wl-cd-pic">
                  {picture.url ? <a href={picture.url} target="_blank" rel="noreferrer" className="wl-cd-img" style={{ backgroundImage: `url(${picture.url})` }} aria-label={`Open the ${picture.label} picture`} /> : <span className="wl-cd-img" />}
                  <div className="wl-cd-what"><b>{picture.label}</b><small>{picture.placements} {picture.placements === 1 ? "placement" : "placements"}{picture.cropped ? " · main picture, cropped" : ""}</small></div>
                  <div className="wl-cd-bar"><Bar pct={(picture.impressions / most) * 100} tone="#c94a24" /></div>
                  <div className="wl-cd-num"><b>{count(picture.impressions)}</b><small>{count(picture.perPlacement)} per placement</small></div>
                  <div className="wl-cd-num"><b>{credits(earnedOf(picture.impressions))} C.</b><small>earned</small></div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {d.games.length > 1 && <p className="wl-cd-games"><b>By game:</b> {d.games.map((game) => `${game.name} ${count(game.impressions)}`).join(" · ")}</p>}
    </div>
  );
}

export default function DeveloperWallet({ wallet, sub, initialTab = "overview" }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [period, setPeriod] = useState(30);
  const [span, setSpan] = useState({ days: 30 }); // the period of the History list
  // The window of one campaign (from By campaign): { id, name } while it loads, then with `data` or `error`.
  const [details, setDetails] = useState(null);
  useWaitMark(Boolean(details && !details.data && !details.error));
  async function openCampaign(campaign) {
    setDetails({ id: campaign.id, name: campaign.name });
    const result = await campaignDetails({ campaignId: campaign.id, days: period }).catch(() => ({ error: "Connection lost. Try again." }));
    setDetails((now) => (now?.id === campaign.id ? { ...now, data: result?.details ?? null, error: result?.error ?? "" } : now));
  }
  const [kind, setKind] = useState("all"); // what History lists: everything, earnings or payouts
  const [ticked, setTicked] = useState([TOTAL]);
  const tabs = useRef({});

  function choose(next, focus = false) {
    setTab(next);
    try { window.history.replaceState(window.history.state, "", next === "history" ? "?tab=history" : window.location.pathname); } catch {}
    window.scrollTo(0, 0);
    if (focus) tabs.current[next]?.focus();
  }
  // The menu entry of this window while one of its tabs is open: show the first tab, nothing to fetch.
  useSamePage(() => choose("overview"));
  const onKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    choose(tab === "history" ? "overview" : "history", true);
  };

  const games = wallet.games.map((game, index) => ({ ...game, color: GAME_LINES[index % GAME_LINES.length][0], tint: GAME_LINES[index % GAME_LINES.length][1] }));
  const days = wallet.days.slice(-period);
  const seriesOf = (gameId) => (wallet.daily[gameId] ?? new Array(wallet.days.length).fill(0)).slice(-period);
  const totalSeries = days.map((_, index) => sum(games.map((game) => seriesOf(game.id)[index])));
  const paid = sum(totalSeries);
  const campaigns = wallet.campaigns[period] ?? [];

  const toggle = (id) => setTicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  // The ticks decide what the chart draws: the All games line, any game's own line, or both together.
  const order = [TOTAL, ...games.map((game) => game.id)].filter((id) => ticked.includes(id));
  const split = !(order.length === 1 && order[0] === TOTAL);
  const lines = order.map((id) => {
    if (id === TOTAL) return { id, total: true, name: "All games", ...TOTAL_LINE, values: totalSeries.map(earnedOf) };
    const game = games.find((entry) => entry.id === id);
    return { id, name: game.name, color: game.color, tint: game.tint, values: seriesOf(id).map(earnedOf) };
  });
  const legend = lines.length ? (
    <ul className="ovx-legend wl-glegend">
      {lines.map((line) => <li key={line.id}><span className="wl-gline" style={{ background: line.color }} /><span>{line.name}</span><b>{credits(sum(line.values))} C.</b></li>)}
    </ul>
  ) : null;

  const gameRows = games.map((game) => ({ game, paid: sum(seriesOf(game.id)), campaigns: campaigns.filter((campaign) => campaign.games.includes(game.id)).length }));
  const most = Math.max(1, ...gameRows.map((row) => row.paid));

  // what the games earned minus what was already paid out (migration 0068)
  const payouts = wallet.payouts ?? [];
  const balance = Math.max(0, wallet.total.amount * DEV_SHARE - (wallet.paidOut ?? 0));
  const lastPayout = payouts[0] ?? null;
  const plan = payoutPlan(balance);
  const overview = (
    <>
      <div className="wl-lay wl-layA">
        <section className="wl-hero wl-hero-solo">
          <div className="wl-hero-main">
            <HeroAmount
              label={<>Balance <Hint title="How you get paid" text={`What your games earned and was not paid out yet. On the 1st of each month, once it has reached ${credits(plan.minimum)} C., the whole balance is paid out and it starts again from zero. There is nothing to request. During the pilot payouts are a demo: no money is sent.`} /></>}
              value={credits(balance)}
              sub={<>credits not paid out yet <Hint title="What is a credit?" text={creditNote("see")} /></>}
            />
          </div>
          <dl className="wl-hero-strip">
            {[
              [`Earned · ${period} days`, credits(earnedOf(paid)), `${count(paid)} paid impressions`],
              ["Earned today", credits(wallet.today.amount * DEV_SHARE), `${count(wallet.today.impressions)} paid impressions`],
              ["Your rate", credits(RATE * DEV_SHARE), `per 1,000 paid impressions · you keep 80% of ${credits(RATE)} C.`],
            ].map(([label, value, caption]) => <div key={label}><dt>{label}</dt><dd><Figure>{value}</Figure></dd><small title={caption}>{caption}</small></div>)}
          </dl>
        </section>
        <section className="gp-panel wl-ops wl-blk wl-payout" aria-label="Payout">
          <BlockHead icon="payout" title="Payout" left={<Hint title="Payout" text={`Once a month, on the 1st, the whole balance is paid out if it has reached ${credits(plan.minimum)} C. A smaller balance stays and counts toward the next month.`} />} />
          <div className="wl-pay-goal">
            <div className="wl-pay-line"><b>{plan.reached ? "Minimum reached" : `${credits(plan.left)} C. to the minimum`}</b><span><Figure>{credits(Math.min(balance, plan.minimum))}</Figure> of {credits(plan.minimum)} C.</span></div>
            <div className="wl-pay-track" role="img" aria-label={`${plan.pct}% of the payout minimum`}><i style={{ width: `${plan.pct}%` }} /></div>
          </div>
          <ul>
            <li><div><b>Next payout</b><small>{plan.reached ? <><Figure>{credits(balance)}</Figure> C. as it stands now</> : `if the balance reaches ${credits(plan.minimum)} C. by then`}</small></div><span className="wl-pay-v">{dayText(plan.next)}</span></li>
            <li>
              <div><b>Last payout</b><small>{lastPayout ? <>{dayText(lastPayout.day)}{lastPayout.demo ? " · demo" : ""} · <button type="button" className="link-button" onClick={() => { setKind("payouts"); choose("history"); }}>all payouts</button></> : "none yet"}</small></div>
              <span className={`wl-pay-v${lastPayout ? "" : " is-none"}`}>{lastPayout ? <><Figure>{credits(lastPayout.amount)}</Figure> C.</> : "—"}</span>
            </li>
            <li><div><b>Paid out · all time</b><small>{payouts.length} {payouts.length === 1 ? "payout" : "payouts"}</small></div><span className={`wl-pay-v${payouts.length ? "" : " is-none"}`}><Figure>{credits(wallet.paidOut ?? 0)}</Figure> C.</span></li>
          </ul>
          <p className="wl-pay-note">Pilot: payouts are a demo, no money is sent. At full launch every balance starts from zero.</p>
        </section>
      </div>
      <MoneyChart
        title="Earnings per day"
        hint={<Hint title="Earnings per day" text="Credits your games earned each day. Tick lines in By game below to choose what the chart shows: All games is the total, and every game can be added as a line of its own to compare. Only counted impressions of advertisers’ creatives are paid." />}
        tools={<PeriodPick value={period} options={PERIODS} onChange={setPeriod} />}
        days={days}
        rows={totalSeries.map((impressions) => ({ impressions, value: earnedOf(impressions) }))}
        what="Earned"
        lines={split ? lines : null}
        legend={legend}
        emptyText="Nothing is ticked. Tick All games or a game in By game below."
      />
      <div className="wl-two">
        <TableBox title="By game" tools={<span className="ovx-hint">Last {period} days · tick what the chart shows</span>} head={[[""], ["Game"], ["Paid impressions", true], ["Earned", true], [""]]}>
          <tr className="wl-totalrow">
            <td className="wl-tickcell"><label className="wl-tick" title="Show all games together on the chart"><input type="checkbox" checked={ticked.includes(TOTAL)} onChange={() => toggle(TOTAL)} aria-label="Show all games together on the chart" /><i style={{ "--c": TOTAL_LINE.color }} /></label></td>
            <td><span className="wl-cname"><span><b>All games</b><small>{games.length} {games.length === 1 ? "game" : "games"} together</small></span></span></td>
            <td className="num">{count(paid)}</td>
            <td className="num"><b>{credits(earnedOf(paid))}</b></td>
            <td className="wl-barcell" />
          </tr>
          {gameRows.map(({ game, paid: gamePaid, campaigns: running }) => (
            <tr key={game.id} className={game.deleted ? undefined : "wl-row"} onClick={(event) => { if (!game.deleted && !event.target.closest("label, input, a, button")) router.push(`/dashboard/g/${game.id}?tab=performance`); }}>
              <td className="wl-tickcell"><label className="wl-tick" title={`Show ${game.name} on the chart`}><input type="checkbox" checked={ticked.includes(game.id)} onChange={() => toggle(game.id)} aria-label={`Show ${game.name} on the chart`} /><i style={{ "--c": game.color }} /></label></td>
              <td><span className="wl-cname"><GameBadge game={game} /><span><b>{game.name}</b><small>{running} {running === 1 ? "campaign" : "campaigns"}</small></span></span></td>
              <td className="num">{count(gamePaid)}</td>
              <td className="num"><b>{credits(earnedOf(gamePaid))}</b></td>
              <td className="wl-barcell"><Bar pct={(gamePaid / most) * 100} tone="#c94a24" /></td>
            </tr>
          ))}
          {games.length === 0 ? <tr><td colSpan={5} className="wl-none">Add a game and open its placements to advertisers: what it earns shows up here.</td></tr> : null}
        </TableBox>
        <TableBox title="By campaign" tools={<span className="ovx-hint">Last {period} days</span>} head={[["Campaign"], ["Paid impressions", true], ["Earned", true]]}>
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td><span className="wl-cname"><span className="rd-tile wl-ctile"><CategoryIcon category={campaign.category} label={campaign.category ? categoryLabel(campaign.category) : "No category"} /></span><span><button type="button" className="wl-clink" title="How this campaign did in your games" onClick={() => openCampaign(campaign)}>{campaign.name}</button><small>{campaign.advertiser} · <em style={{ color: STATUS_TONE[campaign.status.key] ?? "#8c7f73" }}>{campaign.status.label}</em></small></span></span></td>
              <td className="num">{count(campaign.impressions)}</td>
              <td className="num"><b>{credits(earnedOf(campaign.impressions))}</b></td>
            </tr>
          ))}
          {campaigns.length === 0 ? <tr><td colSpan={3} className="wl-none">No campaign paid for impressions in these {period} days.</td></tr> : null}
        </TableBox>
      </div>
    </>
  );

  // History: one line per game per day, newest first.
  const history = [];
  const all = wallet.days;
  const [from, to] = historyRange(span);
  for (let index = all.length - 1; index >= 0; index -= 1) {
    if (all[index] < from || all[index] > to) continue;
    for (const game of games) {
      const n = wallet.daily[game.id]?.[index] ?? 0;
      if (n > 0) history.push({ key: `${all[index]}:${game.id}`, day: all[index], game: game.name, impressions: n });
    }
  }
  // Payouts sit among the earnings by their day; on one day the payout comes first (it closes the days before it).
  const historyLines = [
    ...(kind === "payouts" ? [] : history),
    ...(kind === "earnings" ? [] : payouts.filter((row) => row.day >= from && row.day <= to).map((row) => ({ key: `payout:${row.day}`, day: row.day, payout: true, amount: row.amount, demo: row.demo }))),
  ].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.payout ? 1 : 0) - (a.payout ? 1 : 0)));
  const historyTab = (
    <TableBox title="History" icon="history" className="wl-histbox" tools={<><div className="cr-tabs" role="tablist" aria-label="Show">{[["all", "All"], ["earnings", "Earnings"], ["payouts", "Payouts"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={kind === key} onClick={() => setKind(key)}>{label}</button>)}</div><HistoryPeriod value={span} onChange={setSpan} min={all[0] ?? null} /></>} head={[["Date"], ["Operation"], ["Amount", true]]} note={<p className="wl-foot">Earnings: one line per game per day, kept for the last {all.length} days. Payouts: on the 1st of a month, the whole balance once it has reached {credits(plan.minimum)} C.</p>}>
      {historyLines.map((row) => row.payout ? (
        <tr key={row.key}>
          <td className="wl-date">{dayText(row.day)}</td>
          <td><span className="wl-kind wl-k-sp">{row.demo ? "Payout · demo" : "Payout"}</span> {row.demo ? "Balance paid out (pilot: no money was sent)" : "Balance paid out"}</td>
          <td className="num"><Amount value={-row.amount} /></td>
        </tr>
      ) : (
        <tr key={row.key}>
          <td className="wl-date">{dayText(row.day)}</td>
          <td><span className="wl-kind wl-k-top">Earnings</span> {row.game} · {count(row.impressions)} impressions</td>
          <td className="num"><Amount value={earnedOf(row.impressions)} /></td>
        </tr>
      ))}
      {historyLines.length === 0 ? <tr><td colSpan={3} className="wl-none">{kind === "payouts" ? "No payouts in this period." : "Nothing in this period."}</td></tr> : null}
    </TableBox>
  );

  return (
    <div className="gp">
      <WindowTop title="Wallet" titleExtra={<TestMark />} sub={sub} icon={<PlateIcon name="wallet" />}>
        <div className="tabs" role="tablist" aria-label="Wallet sections" onKeyDown={onKeyDown}>
          {[["overview", "Overview"], ["history", "History"]].map(([key, label]) => (
            <button key={key} type="button" ref={(el) => { tabs.current[key] = el; }} className="tab" role="tab" aria-selected={tab === key} aria-current={tab === key ? "page" : undefined} tabIndex={tab === key ? 0 : -1} onClick={() => choose(key)}>{label}</button>
          ))}
        </div>
      </WindowTop>
      <div className="gp-work">{tab === "overview" ? overview : historyTab}</div>
      <Modal open={Boolean(details)} onClose={() => setDetails(null)} title={details?.name ?? "Campaign"} wide lightClose footer={<button type="button" className="button" onClick={() => setDetails(null)}>Close</button>}>
        {details && !details.data && !details.error && <p className="wl-cd-wait"><span className="spinner" aria-hidden="true" /> Loading…</p>}
        {details?.error && <p className="error" role="alert">{details.error}</p>}
        {details?.data && <CampaignDetails d={details.data} />}
      </Modal>
    </div>
  );
}
