"use client";

import Audience from "../../../../creatives/[id]/audience";
import { setCampaignAudience } from "../../../actions";

/** The audience of the whole campaign: it applies on top of each creative's own audience. */
export default function CampaignAudience({ campaignId, initial, catalog }) {
  return (
    <Audience
      subject="campaign"
      initial={initial}
      catalog={catalog}
      onSave={({ targeting }) => setCampaignAudience({ campaignId, targeting })}
    />
  );
}
