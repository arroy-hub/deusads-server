import Link from "next/link";
import { loadCreativeLibrary } from "../../../lib/advertiser-data";
import SectionTabs from "../advertising/section-tabs";
import Library from "./library";

/** The advertiser's Creatives tab: cards with the formats each creative covers. A card opens the editor as a pop-up. */
export default async function AdvertiserCreatives({ me }) {
  const { creatives, campaignCount } = await loadCreativeLibrary(me.service, me);
  return (
    <>
      <div className="main-head">
        <h1>Campaigns</h1>
        <Link href="/dashboard/advertising/new" className="button">
          New campaign
        </Link>
      </div>
      <p className="lede">Your campaigns and the creatives they use.</p>
      <SectionTabs active="creatives" campaigns={campaignCount} creatives={creatives.length} />
      <div className="lib-head">
        <p className="settings-help">Any creative can be used in any campaign. Open one to frame it and add pictures for other shapes.</p>
        <Link href="/dashboard/advertising/new" className="button button-quiet">
          Add a creative
        </Link>
      </div>
      <Library creatives={creatives} />
    </>
  );
}
