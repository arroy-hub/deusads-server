"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CampaignCard, CampaignStrip } from "./campaign-cards";
import { Opt, PopBtn } from "../_cabinet/filters";
import { PauseDialog } from "../_cabinet/ui";
import { IcGrid, IcPlus } from "../_cabinet/icons";
import { STATUS_GROUPS, campaignGroup, filterCampaigns } from "../../../lib/campaign-list";
import { compactCount, plural, sortCampaigns } from "../../../lib/campaign-cards";

const SORTS = [["status", "Status"], ["impressions", "Impressions"], ["name", "Name"], ["dates", "Start date"]];
const SORT_NAME = Object.fromEntries(SORTS);
/** The sections of the grouped view, in this order; Draft and Ended start folded. */
const SECTIONS = STATUS_GROUPS.slice(1);
const FOLDED = { draft: true, ended: true };
const SECTION_TONE = { live: "live", paused: "warn", upcoming: "sched", draft: "mute", ended: "mute" };

const ListIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
const CaretIcon = () => <svg className="cx-scar" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

/**
 * The Campaigns tab. One white plate holds the search, the status filter, the sort (list view only), the view switch
 * and "New campaign". The campaigns show either grouped by status (C, the default) as cards, or as one list of long strips (B).
 */
export default function CampaignsPanel({ campaigns: raw, error = false, rules = true, today }) {
  const [dlg, setDlg] = useState(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState({ key: "status", dir: "asc" });
  const [view, setView] = useState("c"); // "c": sections by status, "b": long strips
  const [folded, setFolded] = useState({});

  const shown = useMemo(() => {
    const filtered = filterCampaigns(raw, { query, group });
    return sortCampaigns(filtered, sort.key, sort.dir);
  }, [raw, query, group, sort]);
  const empty = raw.length === 0; // no campaigns at all (a filter that hides every one is not this)
  const count = (key) => (key === "all" ? raw.length : raw.filter((c) => campaignGroup(c) === key).length);
  const pause = (campaign, mode) => setDlg({ camp: campaign, mode });
  const pickSort = (key) => setSort({ key, dir: key === "impressions" ? "desc" : "asc" });
  const clear = () => { setQuery(""); setGroup("all"); };
  const chosenGroup = group === "all" ? "" : STATUS_GROUPS.find(([key]) => key === group)?.[1];
  const chosenSort = sort.key === "status" ? "" : SORT_NAME[sort.key];
  const props = (campaign) => ({ campaign, rules, today, onPause: pause });

  return (
    <div className="cx-body">
      {error && <p className="notice">Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to turn bookings on.</p>}
      {!empty && (
        <div className="cx-plate">
          <input type="search" className="field fl-search" placeholder="Search campaigns" aria-label="Search campaigns" value={query} onChange={(e) => setQuery(e.target.value)} />
          <PopBtn label="Status" value={chosenGroup} width={220}>
            {(close) => STATUS_GROUPS.map(([key, text]) => (
              <Opt key={key} on={group === key} count={count(key)} onClick={() => { setGroup(key); close(); }}>{text}</Opt>
            ))}
          </PopBtn>
          {view === "b" && (
            <PopBtn label="Sort" value={chosenSort} width={200}>
              {(close) => SORTS.map(([key, text]) => <Opt key={key} on={sort.key === key} onClick={() => { pickSort(key); close(); }}>{text}</Opt>)}
            </PopBtn>
          )}
          {(query || group !== "all") && <button type="button" className="link-button" onClick={clear}>Clear</button>}
          <div className="cx-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "b"} title="List" aria-label="List view" onClick={() => setView("b")}><ListIcon /></button>
            <button type="button" aria-pressed={view === "c"} title="Grouped by status" aria-label="Grouped by status" onClick={() => setView("c")}><IcGrid size={16} /></button>
          </div>
          <span className="cx-spacer" />
          <span className="fl-shown" aria-live="polite">{plural(shown.length, "campaign", "campaigns")}</span>
          <Link href="/dashboard/advertising/new" className="button button-with-icon"><IcPlus size={16} />New campaign</Link>
        </div>
      )}

      <div id="cx-out" aria-live="polite">
        {empty ? (
          <>
            <section className="rd-list" aria-label="Campaigns">
              <div className="rd-empty-row">
                <span className="rd-empty-ic"><IcGrid size={22} /></span>
                <div><strong>No campaigns yet</strong><span>A campaign puts one creative in front of the games you choose. Nothing goes live until your creative is approved.</span></div>
                <Link href="/dashboard/advertising/new" className="button">Create your first campaign</Link>
              </div>
            </section>
            <ol className="rd-steps">
              <li><b>1</b><span><strong>Add a creative</strong>Upload a PNG or JPG. We check it and help you cover every ad shape.</span></li>
              <li><b>2</b><span><strong>Choose where</strong>Pick the audience: genres, platforms and languages.</span></li>
              <li><b>3</b><span><strong>Set the dates and start</strong>Ads begin when the creative is approved. You can stop any time.</span></li>
            </ol>
          </>
        ) : shown.length === 0 ? (
          <div className="cx-empty">No campaigns match the filters.</div>
        ) : view === "b" ? (
          <div className="cx-strips">
            {shown.map((c) => <CampaignStrip key={c.id} {...props(c)} />)}
            <Link href="/dashboard/advertising/new" className="cx-strip cx-add rd-add-row"><span><IcPlus size={16} /></span>New campaign</Link>
          </div>
        ) : (
          SECTIONS.map(([key, text]) => {
            const items = shown.filter((c) => campaignGroup(c) === key);
            if (!items.length) return null;
            const shut = folded[key] ?? Boolean(FOLDED[key]);
            return (
              <section key={key} className={`cx-sec${shut ? " shut" : ""}`} style={{ "--tone": `var(--cx-${SECTION_TONE[key]})` }}>
                <button type="button" className="cx-sec-h" aria-expanded={!shut} onClick={() => setFolded((f) => ({ ...f, [key]: !shut }))}>
                  <i className="cx-sd" /><h2>{text}</h2><span className="cx-sn">{items.length}</span>
                  <span className="cx-stot">{compactCount(items.reduce((sum, c) => sum + c.impressions, 0))} impressions</span>
                  <CaretIcon />
                </button>
                <div className="cx-grid">{items.map((c) => <CampaignCard key={c.id} {...props(c)} />)}</div>
              </section>
            );
          })
        )}
      </div>

      <p className="cx-foot">Developers can pause or block an ad in their game; you will see where and why in the campaign report.</p>
      {dlg && <PauseDialog name={dlg.camp.name} campaignId={dlg.camp.id} initial={dlg.mode} status={dlg.camp.status.key} onClose={() => setDlg(null)} />}
    </div>
  );
}
