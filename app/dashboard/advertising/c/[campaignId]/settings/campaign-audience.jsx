"use client";

import { useState } from "react";
import Audience from "../../../../creatives/[id]/audience";
import { setCampaignAudience } from "../../../actions";
import { countFitting, hasTargeting, labelOf } from "../../../../../../lib/targeting";

/** The audience of the whole campaign: a short summary with an Edit button that opens the full editor. It applies on top of each creative's own audience. */
export default function CampaignAudience({ campaignId, initial, catalog }) {
  const [open, setOpen] = useState(false);
  const targeting = hasTargeting(initial) ? initial : null;
  const fitting = catalog ? countFitting(catalog, targeting) : null;
  const chips = [];
  for (const key of ["genres", "platforms", "languages"]) for (const id of targeting?.[key] ?? []) chips.push({ key: `${key}:${id}`, text: labelOf(key, id), on: key === "genres" });
  for (const id of targeting?.exclude_genres ?? []) chips.push({ key: `x:${id}`, text: `not ${labelOf("genres", id)}`, off: true });

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
        <div className="cs-chips">
          {chips.length === 0 ? <span className="cs-chip">Every game</span> : chips.map((chip) => <span key={chip.key} className={`cs-chip${chip.off ? " is-off" : chip.on ? " is-on" : ""}`}>{chip.text}</span>)}
        </div>
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
