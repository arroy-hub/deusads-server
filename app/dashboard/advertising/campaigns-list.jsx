"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CategoryIcon from "./category-icon";
import { categoryLabel } from "../../../lib/categories";
import { formatCount } from "../../../lib/analytics";
import { sortByCategory } from "../../../lib/campaign-list";
import { TONE } from "../_cabinet/dates";
import { DateRange, MenuItem, MenuSep, PauseDialog, Pop, Tip } from "../_cabinet/ui";
import { IcCaret, IcCopy, IcGear, IcGrid, IcMore, IcPause, IcPlay, IcPlus, IcReport } from "../_cabinet/icons";
import { duplicateCampaign } from "./actions";
import { navigating } from "../_cabinet/nav";

function RowMenu({ campaign, rules, onPause }) {
  const router = useRouter();
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [problem, setProblem] = useState("");
  const draft = campaign.status.key === "draft";
  const canPause = rules && campaign.canPause;
  const paused = campaign.status.key === "paused";
  const close = () => setOpen(false);
  async function copy() {
    setCopying(true);
    setProblem("");
    const result = await duplicateCampaign({ campaignId: campaign.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setCopying(false);
    if (result?.error) return setProblem(result.error);
    close();
    navigating();
    router.push(`/dashboard/advertising/new?campaign=${result.campaignId}`);
  }
  return (
    <>
      <button ref={btn} type="button" className="rd-more" aria-label={`Actions for ${campaign.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><IcMore /></button>
      <Pop anchor={btn} open={open} onClose={close} width={224} label={`Actions for ${campaign.name}`}>
        <Link role="menuitem" className="rd-mi" href={draft ? `/dashboard/advertising/new?campaign=${campaign.id}` : `/dashboard/advertising/c/${campaign.id}`} onClick={close}><span className="rd-mi-ic"><IcReport /></span><span className="rd-mi-text">{draft ? "Continue setup" : "Open report"}</span></Link>
        <Link role="menuitem" className="rd-mi" href={`/dashboard/advertising/c/${campaign.id}/placements`} onClick={close}><span className="rd-mi-ic"><IcGrid /></span><span className="rd-mi-text">Placements</span></Link>
        <Link role="menuitem" className="rd-mi" href={`/dashboard/advertising/c/${campaign.id}/settings`} onClick={close}><span className="rd-mi-ic"><IcGear /></span><span className="rd-mi-text">Settings</span></Link>
        <MenuSep />
        {canPause && <MenuItem icon={paused ? <IcPlay /> : <IcPause />} onClick={() => { close(); onPause(paused ? "resume" : "pause"); }}>{paused ? "Resume…" : "Pause…"}</MenuItem>}
        {rules && <MenuItem icon={<IcCopy />} onClick={copy} disabled={copying}>{copying ? "Copying…" : "Duplicate"}</MenuItem>}
        {problem && <div className="rd-pop-note error" role="alert">{problem}</div>}
      </Pop>
    </>
  );
}

function Row({ campaign, rules, onPause }) {
  const tone = TONE[campaign.status.key] ?? "#8c7f73";
  const draft = campaign.status.key === "draft";
  const label = campaign.category ? categoryLabel(campaign.category) : "No category yet";
  return (
    <div className={`rd-row s-${campaign.status.key}`} style={{ "--tone": tone }}>
      <div className="rd-name">
        <Tip content={<><b>{campaign.status.label}</b>{campaign.status.note && <span>{campaign.status.note}</span>}</>}>
          <span className="rd-tile" tabIndex={0} aria-label={`Status: ${campaign.status.label}`}>
            <CategoryIcon category={campaign.category} label={label} />
            <i className="rd-tile-dot" />
          </span>
        </Tip>
        <div className="rd-name-text">
          <Link href={draft ? `/dashboard/advertising/new?campaign=${campaign.id}` : `/dashboard/advertising/c/${campaign.id}`}><strong>{campaign.name}</strong></Link>
          <span className="rd-meta">{label}</span>
        </div>
      </div>
      <div className="rd-dates"><DateRange start={campaign.starts || ""} end={campaign.ends || ""} tone={tone} paused={campaign.status.key === "paused"} over={["stopped", "ended"].includes(campaign.status.key)} animated={!["paused", "stopped", "ended"].includes(campaign.status.key)} /></div>
      <div className="rd-audience">{campaign.audience || (campaign.launched || campaign.bookings ? "Every game" : "Not chosen yet")}</div>
      <div className="rd-num">{campaign.impressions > 0 ? formatCount(campaign.impressions) : "—"}</div>
      <div className="rd-acts"><RowMenu campaign={campaign} rules={rules} onPause={(mode) => onPause(campaign, mode)} /></div>
    </div>
  );
}

const COLS = [["name", "Campaign", "asc"], ["dates", "Dates", "asc"], ["audience", "Audience", "asc"], ["impressions", "Impressions, 30 days", "desc"]];
const keyOf = (c, k) => (k === "name" ? c.name.toLowerCase() : k === "dates" ? c.starts || "" : k === "audience" ? (c.audience || (c.launched || c.bookings ? "Every game" : "")).toLowerCase() : c.impressions);

export default function CampaignsListV2({ campaigns: raw, error = false, rules = true }) {
  const [dlg, setDlg] = useState(null);
  const [sort, setSort] = useState(null); // { key, dir }
  const campaigns = useMemo(() => {
    if (!sort) return raw;
    // The Campaign column groups by the ad category under each name (in the order of the category list), then by name.
    if (sort.key === "name") return sortByCategory(raw, sort.dir);
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...raw].sort((a, b) => {
      const x = keyOf(a, sort.key), y = keyOf(b, sort.key);
      if (x === "" && y !== "") return 1;
      if (y === "" && x !== "") return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * sign;
    });
  }, [raw, sort]);
  const pick = (key, first) => setSort((s) => (s?.key !== key ? { key, dir: first } : s.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null));
  const empty = campaigns.length === 0;
  return (
    <div className="pg-ic pg-campaigns">
      <div className="main-head">
        <div><h1>Campaigns</h1><p className="lede">Your campaigns and where each one stands.</p></div>
        <Link href="/dashboard/advertising/new" className="button button-with-icon"><IcPlus size={16} />New campaign</Link>
      </div>
      {error && <p className="notice">Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to turn bookings on.</p>}
      <section className="rd-list" aria-label="Campaigns">
        <div className="rd-scroll">
          <div className="rd-grid">
            <div className="rd-head" role="row">
              {COLS.map(([key, label, first]) => (
                <span key={key} className={key === "impressions" ? "rd-num" : ""} role="columnheader" aria-sort={sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className={`rd-sort${sort?.key === key ? " is-on" : ""}`} onClick={() => pick(key, first)} title={key === "name" ? "Group by ad category, then by name" : `Sort by ${label.toLowerCase()}`}>{label}<span className={`rd-sort-ic${sort?.key === key ? ` is-${sort.dir}` : ""}`} aria-hidden="true"><IcCaret size={12} /></span></button>
                </span>
              ))}
              <span />
            </div>
            {campaigns.map((c) => <Row key={c.id} campaign={c} rules={rules} onPause={(camp, mode) => setDlg({ camp, mode })} />)}
            {empty && (
              <div className="rd-empty-row">
                <span className="rd-empty-ic"><IcGrid size={22} /></span>
                <div><strong>No campaigns yet</strong><span>A campaign puts one creative in front of the games you choose. Nothing goes live until your creative is approved.</span></div>
                <Link href="/dashboard/advertising/new" className="button">Create your first campaign</Link>
              </div>
            )}
            {!empty && (
              <Link href="/dashboard/advertising/new" className="rd-add-row"><span><IcPlus size={16} /></span>New campaign</Link>
            )}
          </div>
        </div>
      </section>
      {empty ? (
        <ol className="rd-steps">
          <li><b>1</b><span><strong>Add a creative</strong>Upload a PNG or JPG. We check it and help you cover every ad shape.</span></li>
          <li><b>2</b><span><strong>Choose where</strong>Pick the audience: genres, platforms and languages.</span></li>
          <li><b>3</b><span><strong>Set the dates and start</strong>Ads begin when the creative is approved. You can stop any time.</span></li>
        </ol>
      ) : null}
      <p className="cl-foot">Developers can pause or block an ad in their game; you will see where and why in the campaign report.</p>
      {dlg && <PauseDialog name={dlg.camp.name} campaignId={dlg.camp.id} initial={dlg.mode} status={dlg.camp.status.key} onClose={() => setDlg(null)} />}
    </div>
  );
}
