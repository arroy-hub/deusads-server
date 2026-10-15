"use client";

import { Opt, PopBtn } from "../_cabinet/filters";
import { STATUS_GROUPS, campaignGroup } from "../../../lib/campaign-list";

/** The row above the campaigns list: a search by name and the status filter. Sorting stays in the column titles. */
export default function CampaignsBar({ campaigns, query, setQuery, group, setGroup }) {
  const count = (key) => (key === "all" ? campaigns.length : campaigns.filter((c) => campaignGroup(c) === key).length);
  const chosen = group === "all" ? "" : STATUS_GROUPS.find(([key]) => key === group)?.[1];
  return (
    <div className="fl-bar">
      <input type="search" className="field fl-search" placeholder="Search campaigns" aria-label="Search campaigns" value={query} onChange={(e) => setQuery(e.target.value)} />
      <PopBtn label="Status" value={chosen} width={220}>
        {(close) => STATUS_GROUPS.map(([key, text]) => (
          <Opt key={key} on={group === key} count={count(key)} onClick={() => { setGroup(key); close(); }}>{text}</Opt>
        ))}
      </PopBtn>
      {(query || group !== "all") && <button type="button" className="link-button" onClick={() => { setQuery(""); setGroup("all"); }}>Clear</button>}
    </div>
  );
}
