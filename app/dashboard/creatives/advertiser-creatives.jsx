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
        <div>
          <h1>Campaigns</h1>
          <p className="lede">Your campaigns and the creatives they use.</p>
        </div>
        <Link href="/dashboard/advertising/new" className="button">
          New campaign
        </Link>
      </div>
      <SectionTabs active="creatives" campaigns={campaignCount || null} creatives={creatives.length || null} />
      <div className="lib-head">
        <p className="settings-help">Any creative can be used in any campaign.</p>
        <Link href="/dashboard/advertising/new" className="button button-quiet">
          Add a creative
        </Link>
      </div>
      <Library creatives={creatives} />
    </>
  );
}
