"use client";

import { useRef, useState } from "react";
import CampaignsPanel from "./campaigns-panel";
import Library from "../creatives/library";
import WindowTop, { PlateIcon } from "../window-top";

const HEAD = {
  camp: ["Campaigns", "Your campaigns and where each one stands."],
  cr: ["Creatives", "Your pictures and the ad shapes each one covers."],
};

/**
 * The advertiser's Campaigns window: one header with two tabs, Campaigns and Creatives. Both tabs stay mounted, so
 * switching is instant and neither loses its filters. The address keeps the tab (?tab=creatives) for links and reloads.
 */
export default function CampaignsWindow({ campaigns, error, rules, today, library, initialTab = "camp" }) {
  const [tab, setTab] = useState(initialTab);
  const [creativeCount, setCreativeCount] = useState(library.creatives.length);
  const tabs = useRef({});
  const [title, lede] = HEAD[tab];

  function choose(next, focus = false) {
    setTab(next);
    try { window.history.replaceState(window.history.state, "", next === "cr" ? "?tab=creatives" : window.location.pathname); } catch {}
    window.scrollTo(0, 0);
    if (focus) tabs.current[next]?.focus();
  }
  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    choose(tab === "cr" ? "camp" : "cr", true);
  };

  return (
    <div className="wt-win pg-campaigns cx-win" data-tab={tab}>
      <WindowTop title={title} sub={lede} icon={<PlateIcon name="campaigns" />}>
        <div className="tabs" role="tablist" aria-label="Campaigns sections" onKeyDown={onKeyDown}>
          <button type="button" ref={(el) => { tabs.current.camp = el; }} className="tab" role="tab" id="cx-tab-camp" aria-selected={tab === "camp"} aria-current={tab === "camp" ? "page" : undefined} aria-controls="cx-panel-camp" tabIndex={tab === "camp" ? 0 : -1} onClick={() => choose("camp")}>Campaigns <span className="cp-count" style={{ marginLeft: "0.5rem" }}>{campaigns.length}</span></button>
          <button type="button" ref={(el) => { tabs.current.cr = el; }} className="tab" role="tab" id="cx-tab-cr" aria-selected={tab === "cr"} aria-current={tab === "cr" ? "page" : undefined} aria-controls="cx-panel-cr" tabIndex={tab === "cr" ? 0 : -1} onClick={() => choose("cr")}>Creatives <span className="cp-count" style={{ marginLeft: "0.5rem" }}>{creativeCount}</span></button>
        </div>
      </WindowTop>
      <div id="cx-panel-camp" role="tabpanel" aria-labelledby="cx-tab-camp" hidden={tab !== "camp"}>
        <CampaignsPanel campaigns={campaigns} error={error} rules={rules} today={today} />
      </div>
      <div id="cx-panel-cr" role="tabpanel" aria-labelledby="cx-tab-cr" hidden={tab !== "cr"}>
        <Library list={library.creatives} folders={library.folders} folderTools={library.folderTools} onCount={setCreativeCount} />
      </div>
    </div>
  );
}
