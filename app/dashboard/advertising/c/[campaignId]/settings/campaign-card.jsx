"use client";

import { useEffect, useState } from "react";
import CategoryIcon from "../../../category-icon";
import { COVERS } from "../../../../../../lib/game-cover";
import { categoryLabel } from "../../../../../../lib/categories";
import { TONE, diff, fmtDay, todayISO } from "../../../../_cabinet/dates";
import { STATUS_DOT } from "../../../../../../lib/campaign-cover";
import { DateRange } from "../../../../_cabinet/ui";

/**
 * The campaign's own card, set like a game's card in its Settings: it is how the campaign looks in the list of campaigns,
 * drawn live from the form next to it. Its picture is the one behind the campaign's page.
 */
export default function CampaignCard({ name, from, until, status, coverCss, chips, category, creatives, games, placements, header = null }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!e.target.closest?.("[data-cover-menu]")) setMenu(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);
  const tone = TONE[status.key] ?? "#8c7f73";
  const running = !["paused", "stopped", "ended"].includes(status.key);
  const length = from && until ? diff(until, from) + 1 : null;
  // "day 28 of 56" while it runs, the length before it starts and after it ends
  const today = todayISO();
  const day = from && from <= today && (!until || today <= until) ? diff(today, from) + 1 : null;
  const sub = day ? (length ? `day ${day} of ${length}` : `day ${day}`) : length ? `${length} days` : "";
  return (
    <article className="gm-card">
      <div className="gm-cover ag-cover cc-cover" style={{ background: coverCss }}>
        {header && !header.hasPicture && (
          <div className="ag-sw ag-sw-on" role="group" aria-label="Header colours">
            {COVERS.map((item) => <button key={item.id} type="button" className="ag-swatch" style={{ background: item.css }} aria-label={item.name} title={item.name} aria-pressed={item.id === header.colourId} onClick={() => header.onColour(item.id)} />)}
          </div>
        )}
        {header && (
          <span data-cover-menu>
            <button type="button" className="ag-cover-btn" aria-label={header.hasPicture ? "Change header image" : "Upload header image"} title={header.hasPicture ? "Change header image" : "Upload header image"} aria-haspopup={header.hasPicture ? "menu" : undefined} aria-expanded={header.hasPicture ? menu : undefined} onClick={() => (header.hasPicture ? setMenu((v) => !v) : header.onCover())}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01" /></svg>
            </button>
            {menu && (
              <div className="ag-pop" role="menu">
                <button type="button" className="it" role="menuitem" onClick={() => { setMenu(false); header.onCover(); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>Upload another</button>
                <button type="button" className="it is-danger" role="menuitem" onClick={() => { setMenu(false); header.onRemoveCover(); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>Remove picture</button>
              </div>
            )}
          </span>
        )}
      </div>
      <div className="gm-body">
        <div className="gm-plate">
          <span className="gm-icon">
            <span className="rd-tile is-lg cr-top-tile" style={{ "--tone": tone }}>
              <CategoryIcon category={category} label={category ? categoryLabel(category) : "No category yet"} />
            </span>
            <i className="gm-status" style={{ background: STATUS_DOT[status.key] ?? "#9aa0a6" }} role="img" aria-label={status.label} />
          </span>
          <div>
            <h2 className={name.trim() ? undefined : "ag-name-empty"}>{name.trim() || "Campaign name"}</h2>
            <div className="gm-sub"><b style={{ color: tone }}>{status.label}</b>{sub ? ` · ${sub}` : ""}</div>
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
