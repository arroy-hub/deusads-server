"use client";

import { useState } from "react";
import Audience from "../../../../creatives/[id]/audience";
import { setCampaignAudience } from "../../../actions";
import { countFitting, hasTargeting, labelOf } from "../../../../../../lib/targeting";

const GROUPS = [["genres", "Genres", "on"], ["exclude_genres", "Skip genres", "off"], ["platforms", "Platforms and devices", ""], ["languages", "Languages", ""]];

/** The saved audience, split the way the editor splits it: genres, skipped genres, platforms and languages. */
function AudienceGroups({ targeting }) {
  const filled = GROUPS.filter(([key]) => (targeting?.[key] ?? []).length > 0);
  if (filled.length === 0) return <div className="cs-chips"><span className="cs-chip">Every game</span></div>;
  return (
    <dl className="aud-groups">
      {filled.map(([key, label, tone]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{targeting[key].map((id) => <span key={id} className={`cs-chip${tone ? ` is-${tone}` : ""}`}>{labelOf(key === "exclude_genres" ? "genres" : key, id).replace(key === "platforms" ? / \(.*\)$/ : /$^/, "")}</span>)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The audience of the whole campaign: a short summary with an Edit button that opens the full editor. It applies on top of each creative's own audience. */
export default function CampaignAudience({ campaignId, initial, catalog }) {
  const [open, setOpen] = useState(false);
  const targeting = hasTargeting(initial) ? initial : null;
  const fitting = catalog ? countFitting(catalog, targeting) : null;
  return (
    <>
      <section className="cs-card" aria-labelledby="cs-aud-title">
        <div className="cs-aud-head">
          <div>
            <h2 id="cs-aud-title">Audience</h2>
            <p>Who this campaign is shown to.</p>
          </div>
          {fitting !== null && catalog.length > 0 && (
            <span className={`ov-pill ${fitting > 0 ? "ov-live" : "ov-paused"}`}>
              {fitting} of {catalog.length} games
            </span>
          )}
        </div>
        <AudienceGroups targeting={targeting} />
        <div>
          <button type="button" className="button button-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Close editor" : "Edit audience"}
          </button>
        </div>
      </section>
      {open && (
        <Audience
          subject="campaign"
          initial={initial}
          catalog={catalog}
          onSave={({ targeting: next }) => setCampaignAudience({ campaignId, targeting: next })}
        />
      )}
    </>
  );
}
