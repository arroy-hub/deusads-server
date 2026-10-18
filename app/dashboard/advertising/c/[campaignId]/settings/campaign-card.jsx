"use client";

import CategoryIcon from "../../../category-icon";
import { categoryLabel } from "../../../../../../lib/categories";
import { TONE, diff, fmtDay } from "../../../../_cabinet/dates";
import { DateRange } from "../../../../_cabinet/ui";

/**
 * The campaign's own card, set like a game's card in its Settings: it is how the campaign looks in the list of campaigns,
 * drawn live from the form next to it. Its picture is the one behind the campaign's page.
 */
export default function CampaignCard({ name, from, until, status, coverCss, chips, category, creatives, games, placements }) {
  const tone = TONE[status.key] ?? "#8c7f73";
  const running = !["paused", "stopped", "ended"].includes(status.key);
  const length = from && until ? diff(until, from) + 1 : null;
  return (
    <article className="gm-card">
      <div className="gm-cover ag-cover cc-cover" style={{ background: coverCss }} />
      <div className="gm-body">
        <div className="gm-plate">
          <span className="gm-icon">
            <span className="rd-tile is-lg cr-top-tile" style={{ "--tone": tone }}>
              <CategoryIcon category={category} label={category ? categoryLabel(category) : "No category yet"} />
            </span>
            <i className="gm-status" style={{ background: tone }} role="img" aria-label={status.label} />
          </span>
          <div>
            <h2 className={name.trim() ? undefined : "ag-name-empty"}>{name.trim() || "Campaign name"}</h2>
            <div className="gm-sub"><b style={{ color: tone }}>{status.label}</b>{length ? ` · ${length} days` : ""}</div>
          </div>
        </div>
        <div className="ag-tags">
          {chips.length === 0 ? <span className="more">Every game</span> : chips.slice(0, 3).map((chip) => <span key={chip.key}>{chip.text}</span>)}
          {chips.length > 3 && <span className="more">+{chips.length - 3}</span>}
        </div>
        <DateRange start={from} end={until || null} tone={tone} paused={status.key === "paused"} over={["stopped", "ended"].includes(status.key)} animated={running} />
        <div className="ag-meta">
          <div><b>Starts</b>{from ? <span>{fmtDay(from, true)}</span> : <span className="ph">Not set</span>}</div>
          <div><b>Ends</b>{until ? <span>{fmtDay(until, true)}</span> : <span className="ph">No end date</span>}</div>
          <div><b>Creatives</b><span>{creatives} {creatives === 1 ? "creative" : "creatives"}</span></div>
        </div>
        <div className="gm-chips"><span>{games} {games === 1 ? "game" : "games"}</span><span>{placements} {placements === 1 ? "placement" : "placements"}</span></div>
      </div>
    </article>
  );
}
