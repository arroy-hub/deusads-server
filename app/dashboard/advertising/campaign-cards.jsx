"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CategoryIcon from "./category-icon";
import RowMenu from "./row-menu";
import { categoryLabel } from "../../../lib/categories";
import { STATUS_DOT } from "../../../lib/campaign-cover";
import { TONE_VAR, compactCount, dateBar, plural, sparkShape, stripBar, subLine } from "../../../lib/campaign-cards";
import { IcWarn } from "../_cabinet/icons";
import { navigating } from "../_cabinet/nav";

const toneOf = (campaign) => ({ "--tone": `var(--cx-${TONE_VAR[campaign.status.key] ?? "mute"})` });
const hrefOf = (campaign) => (campaign.status.key === "draft" ? `/dashboard/advertising/new?campaign=${campaign.id}` : `/dashboard/advertising/c/${campaign.id}`);
const labelOf = (campaign) => (campaign.category ? categoryLabel(campaign.category) : "No category yet");
const audienceOf = (campaign) => campaign.audience || (campaign.status.key === "draft" ? "Audience not chosen yet" : "Every game");
const hasNote = (campaign) => Boolean(campaign.status.note) && ["limited", "stopped"].includes(campaign.status.key);

/** A card or a strip opens the campaign on a click or Enter; the menu and the links inside keep their own clicks. */
function useOpen(campaign) {
  const router = useRouter();
  const open = () => { navigating(); router.push(hrefOf(campaign)); };
  return {
    onClick: (e) => { if (!e.target.closest("a, button, [role='menu']")) open(); },
    onKeyDown: (e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); },
  };
}

/** Impressions per day as a small line chart; a dashed line when there is nothing to draw yet. */
function Spark({ series }) {
  const shape = sparkShape(series);
  if (!shape) return <svg className="cx-spark" viewBox="0 0 110 34" aria-hidden="true"><path d="M0 30H110" stroke="#e6ddd3" strokeWidth="1.5" strokeDasharray="3 4" fill="none" /></svg>;
  return (
    <svg className="cx-spark" viewBox="0 0 110 34" role="img" aria-label="Impressions, last 30 days">
      <path className="a" d={shape.area} />
      <path className="l" d={shape.line} />
      <circle cx={shape.end[0]} cy={shape.end[1]} r="2.6" fill="var(--tone)" />
    </svg>
  );
}

/** Impressions over the last 30 days, in the form the card prints. */
function Impressions({ campaign }) {
  const some = campaign.impressions > 0;
  return <div className={`cx-num${some ? "" : " zero"}`}>{some ? compactCount(campaign.impressions) : "–"}<small>impressions &middot; 30 days</small></div>;
}

/** The dates of a card as a bar: where it starts and ends, how far along it is. */
function DateBar({ campaign, today }) {
  const bar = dateBar(campaign, today);
  return (
    <div className={`cx-dr ${bar.cls}`}>
      <div className="cx-dr-top">{bar.top ? <><b>{bar.top[0]}</b><span className="cx-dr-arrow">&rarr;</span><b>{bar.top[1]}</b></> : <span className="cx-dr-empty">Not scheduled</span>}</div>
      <div className="cx-dr-track" role="img" aria-label={bar.note}><i className="cx-dr-fill" style={{ width: `${bar.pct}%` }} /></div>
      <div className="cx-dr-note">{bar.note}</div>
    </div>
  );
}

/** The company icon with the colour of its status on the corner. */
function Icon({ campaign }) {
  return (
    <span className="cx-ic">
      <span className="rd-tile"><CategoryIcon category={campaign.category} label={labelOf(campaign)} /></span>
      <i className="cx-st" style={{ background: STATUS_DOT[campaign.status.key] ?? "#9aa0a6" }} role="img" aria-label={campaign.status.label} />
    </span>
  );
}

/** One campaign as a card: the picture with the plate on it, the dates, impressions with their chart, games and placements. */
export function CampaignCard({ campaign, rules, today, onPause }) {
  const open = useOpen(campaign);
  const sub = subLine(campaign, today);
  return (
    <article className={`cx-card s-${campaign.status.key}`} style={toneOf(campaign)} tabIndex={0} aria-label={campaign.name} {...open}>
      <div className="cx-cover" style={{ background: campaign.coverCss }}>
        <div className="cx-dots"><RowMenu campaign={campaign} rules={rules} onPause={(mode) => onPause(campaign, mode)} /></div>
      </div>
      <div className="cx-cb">
        <div className="cx-pl">
          <Icon campaign={campaign} />
          <div><h3><Link href={hrefOf(campaign)}>{campaign.name}</Link></h3><div className="cx-sub"><b>{sub.label}</b>{sub.text}</div></div>
        </div>
        <DateBar campaign={campaign} today={today} />
        {hasNote(campaign) && <div className="cx-note"><IcWarn size={16} /> {campaign.status.note}</div>}
        <div className="cx-stat"><Impressions campaign={campaign} /><Spark series={campaign.daily} /></div>
        <div className="cx-chips"><span>{plural(campaign.games, "game", "games")}</span><span>{plural(campaign.placements, "placement", "placements")}</span></div>
      </div>
    </article>
  );
}

/**
 * One campaign as a long strip: the picture sits behind at full height and dissolves into white; the icon, the name,
 * the status line and the dates share one white plate; impressions and the menu are at the right.
 */
export function CampaignStrip({ campaign, rules, today, onPause }) {
  const open = useOpen(campaign);
  const bar = stripBar(campaign, today);
  const sub = subLine(campaign, today);
  return (
    <article className={`cx-strip s-${campaign.status.key}`} style={toneOf(campaign)} tabIndex={0} aria-label={campaign.name} {...open}>
      <div className="cx-scover"><div className="cx-pic" style={{ background: campaign.coverCss }} /></div>
      <div className="cx-splate">
        <Icon campaign={campaign} />
        <div className="cx-txt">
          <h3><Link href={hrefOf(campaign)}>{campaign.name}</Link></h3>
          <div className="cx-sub"><b>{sub.label}</b>{hasNote(campaign) && <span className="cx-flag" title={campaign.status.note} role="img" aria-label={campaign.status.note}><IcWarn size={14} /></span>} &middot; {audienceOf(campaign)}</div>
        </div>
        <div className="cx-dates">
          <div className={`cx-dr ${bar.cls}`}>
            <div className="cx-dl"><b>{bar.line}</b><span>{bar.note}</span></div>
            <div className="cx-dr-track" role="img" aria-label={`${bar.line} · ${bar.note}`}><i className="cx-dr-fill" style={{ width: `${bar.pct}%` }} /></div>
          </div>
        </div>
      </div>
      <div className="cx-right">
        <div className="cx-snum"><Impressions campaign={campaign} /><Spark series={campaign.daily} /></div>
        <div className="cx-dots-in"><RowMenu campaign={campaign} rules={rules} onPause={(mode) => onPause(campaign, mode)} /></div>
      </div>
    </article>
  );
}
