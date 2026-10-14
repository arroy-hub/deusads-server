import { loadCreativeLibrary } from "../../../lib/advertiser-data";
import Library from "./library";

/** The advertiser's Creatives tab: folders of creative cards with the shapes each one covers. A card opens the editor as a pop-up. */
export default async function AdvertiserCreatives({ me }) {
  const { creatives, folders, folderTools } = await loadCreativeLibrary(me.service, me);
  return <Library list={creatives} folders={folders} folderTools={folderTools} />;
}
