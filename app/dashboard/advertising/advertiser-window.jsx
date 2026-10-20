import { bookingsMissing } from "../../../lib/booking-rules";
import { loadCampaignList, loadCreativeLibrary } from "../../../lib/advertiser-data";
import { todayISO } from "../_cabinet/dates";
import CampaignsWindow from "./campaigns-window";

/** The advertiser's Campaigns window with both tabs loaded. `tab`: "camp" or "cr". The creative editor opens over the Creatives tab. */
export default async function AdvertiserWindow({ me, tab = "camp" }) {
  const [{ campaigns, error, rules }, library] = await Promise.all([loadCampaignList(me.service, me, 30), loadCreativeLibrary(me.service, me)]);
  return <CampaignsWindow campaigns={campaigns} error={bookingsMissing(error)} rules={rules} today={todayISO()} library={library} initialTab={tab} />;
}
