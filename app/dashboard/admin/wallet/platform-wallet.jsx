"use client";

// The platform's Wallet window (admins): what advertisers paid for impressions, how it splits between developers
// and DeusADS, the credits in the system, and the same per campaign and per game.

import { useRef, useState } from "react";
import Link from "next/link";
import WindowTop, { PlateIcon } from "../../window-top";
import { DEV_SHARE, PLATFORM_SHARE, costOf, count, credits, developerPart, platformPart, round2 } from "../../../../lib/wallet";
import { HeroAmount, Hint, MoneyChart, PeriodPick, SumBlock, TableBox, TestMark } from "../../wallet/parts";

const TABS = [["overview", "Overview"], ["advertisers", "Advertisers"], ["developers", "Developers"]];
const STATUS_TONE = { live: "#1b8a50", paused: "#c98a14", budget: "#c98a14", ended: "#8c7f73" };
const PERIODS = [7, 30];
const percent = (share) => `${Math.round(share * 100)}%`;
const sum = (list) => list.reduce((total, value) => total + value, 0);

function GameBadge({ game }) {
  if (game.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="rail-game-icon wl-gic" src={game.iconUrl} alt="" width="34" height="34" />;
  }
  return <span className="rail-game-icon is-empty wl-gic" style={{ background: "#a2432a", color: "#fff" }} aria-hidden="true">{game.name.trim().charAt(0).toUpperCase() || "?"}</span>;
}

export default function PlatformWallet({ wallet, marked, sub, initialTab = "overview" }) {
  const [tab, setTab] = useState(initialTab);
  const [period, setPeriod] = useState(30);
  const tabs = useRef({});

  function choose(next, focus = false) {
    setTab(next);
    try { window.history.replaceState(window.history.state, "", next === "overview" ? window.location.pathname : `?tab=${next}`); } catch {}
    window.scrollTo(0, 0);
    if (focus) tabs.current[next]?.focus();
  }
  const onKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const at = TABS.findIndex(([key]) => key === tab);
    choose(TABS[(at + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0], true);
  };

  // The books: what advertisers paid, the developers' part and what is left for the platform, to the cent.
  const spend = wallet.total.amount;
  const toDevelopers = round2(developerPart(spend));
  const kept = platformPart(spend);
  const days = wallet.days.slice(-period);
  const daily = wallet.daily.slice(-period);
  const inPeriod = sum(daily);
  // Campaigns created before budgets existed run without a limit: developers are paid for them, no wallet is charged.
  const fromWallets = round2(spend) - round2(wallet.noLimit);

  const overview = (
    <>
      <SumBlock
        hero={<HeroAmount label="Platform balance" value={credits(kept)} sub={`credits kept · ${percent(PLATFORM_SHARE)} of advertiser spend`} />}
        cells={[
          ["Advertisers paid", credits(spend), `${count(wallet.total.impressions)} paid impressions`],
          ["Paid to developers", credits(toDevelopers), `${percent(DEV_SHARE)} of advertiser spend`],
          [`Platform share · ${period} days`, credits(costOf(inPeriod) * PLATFORM_SHARE), `today ${credits(wallet.today.amount * PLATFORM_SHARE)}`],
        ]}
      />
      <div className="wl-flow" aria-label="How a credit moves">
        <div><span>Advertisers paid</span><b>{credits(spend)}</b></div>
        <i>=</i>
        <div><span>Developers {percent(DEV_SHARE)}</span><b>{credits(toDevelopers)}</b></div>
        <i>+</i>
        <div className="is-us"><span>DeusADS {percent(PLATFORM_SHARE)}</span><b>{credits(kept)}</b></div>
        <em><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> The books balance</em>
      </div>
      <MoneyChart
        title="Platform share per day"
        tools={<PeriodPick value={period} options={PERIODS} onChange={setPeriod} />}
        days={days}
        rows={daily.map((impressions) => ({ impressions, value: costOf(impressions) * PLATFORM_SHARE }))}
        what="Platform share"
      />
      <div className="wl-two">
        <section className="gp-panel wl-kv">
          <h2>Credits in the system</h2>
          <dl>
            <div><dt>Added by advertisers</dt><dd>{credits(wallet.added)}</dd></div>
            <div><dt>Spent on impressions</dt><dd>{credits(fromWallets)}</dd></div>
            <div><dt>Still in advertisers’ wallets and budgets</dt><dd>{credits(wallet.added - fromWallets)}</dd></div>
            <div><dt>Spent by campaigns with no limit <Hint title="No limit" text="Campaigns created before budgets exist run without a limit. Their impressions are paid to developers the same way, but are not taken from a wallet." /></dt><dd>{credits(wallet.noLimit)}</dd></div>
          </dl>
        </section>
        <section className="gp-panel wl-kv">
          <h2>Marked traffic</h2>
          {marked ? (
            <>
              <dl>
                <div><dt>Advertisers’ impressions marked on Traffic <Hint title="Marked traffic" text={`Impressions of advertisers’ creatives that the Traffic page marked as suspicious in the last ${marked.days} days. The credits are those impressions at the price of an impression.`} /></dt><dd>{count(marked.impressions)}</dd></div>
                <div><dt>Credits charged for them</dt><dd>{credits(costOf(marked.impressions))}</dd></div>
                <div><dt>Share of advertisers’ impressions</dt><dd>{(marked.share * 100).toFixed(1)}%</dd></div>
              </dl>
              <p className="muted wl-p">Marked impressions are charged like any other for now. <Link className="wl-link" href="/dashboard/admin/traffic">Open Traffic</Link></p>
            </>
          ) : (
            <p className="muted wl-p">The Traffic page is not switched on yet, so nothing is marked. <Link className="wl-link" href="/dashboard/admin/traffic">Open Traffic</Link></p>
          )}
        </section>
      </div>
    </>
  );

  const advertisers = (
    <TableBox title="Spend by campaign" head={[["Campaign"], ["Budget", true], ["Paid impressions", true], ["Advertiser paid", true], ["To developers", true], [`Platform ${percent(PLATFORM_SHARE)}`, true]]}>
      {wallet.campaigns.map((campaign) => (
        <tr key={campaign.id}>
          <td><span className="wl-cname"><i className="wl-cpic" style={{ background: campaign.coverCss || "#e6ddd3" }} /><span><b>{campaign.name}</b><small>{campaign.advertiser} · <em style={{ color: STATUS_TONE[campaign.status.key] ?? "#8c7f73" }}>{campaign.status.label}</em></small></span></span></td>
          <td className="num">{campaign.budget.unlimited ? <span className="pill">No limit</span> : credits(campaign.budget.budget)}</td>
          <td className="num">{count(campaign.impressions)}</td>
          <td className="num">{credits(costOf(campaign.impressions))}</td>
          <td className="num">{credits(developerPart(costOf(campaign.impressions)))}</td>
          <td className="num"><b>{credits(platformPart(costOf(campaign.impressions)))}</b></td>
        </tr>
      ))}
      {wallet.campaigns.length === 0 ? <tr><td colSpan={6} className="wl-none">No campaign has paid for impressions yet.</td></tr> : null}
    </TableBox>
  );

  const developers = (
    <TableBox title="Earnings by game" head={[["Game"], ["Paid impressions", true], ["Advertisers paid", true], [`Developer earned ${percent(DEV_SHARE)}`, true], [`Platform ${percent(PLATFORM_SHARE)}`, true]]}>
      {wallet.games.map((game) => (
        <tr key={game.id}>
          <td><span className="wl-cname"><GameBadge game={game} /><span><b>{game.name}</b><small>{game.developer}</small></span></span></td>
          <td className="num">{count(game.impressions)}</td>
          <td className="num">{credits(costOf(game.impressions))}</td>
          <td className="num"><b>{credits(developerPart(costOf(game.impressions)))}</b></td>
          <td className="num">{credits(platformPart(costOf(game.impressions)))}</td>
        </tr>
      ))}
      {wallet.games.length === 0 ? <tr><td colSpan={5} className="wl-none">No game has earned anything yet.</td></tr> : null}
    </TableBox>
  );

  return (
    <div className="gp">
      <WindowTop title="Wallet" titleExtra={<TestMark />} sub={sub} icon={<PlateIcon name="wallet" />}>
        <div className="tabs" role="tablist" aria-label="Wallet sections" onKeyDown={onKeyDown}>
          {TABS.map(([key, label]) => (
            <button key={key} type="button" ref={(el) => { tabs.current[key] = el; }} className="tab" role="tab" aria-selected={tab === key} aria-current={tab === key ? "page" : undefined} tabIndex={tab === key ? 0 : -1} onClick={() => choose(key)}>{label}</button>
          ))}
        </div>
      </WindowTop>
      <div className="gp-work">{tab === "overview" ? overview : tab === "advertisers" ? advertisers : developers}</div>
    </div>
  );
}
