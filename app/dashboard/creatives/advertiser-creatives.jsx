import { loadCreativeLibrary } from "../../../lib/advertiser-data";
import UploadForm from "./upload-form";
import Library from "./library";

/** The advertiser's Creatives tab: cards with the formats each creative covers. A card opens the editor as a pop-up. */
export default async function AdvertiserCreatives({ me }) {
  const { creatives } = await loadCreativeLibrary(me.service, me);
  return (
    <>
      <div className="main-head">
        <div>
          <h1>Creatives</h1>
          <p className="lede">Your pictures and the ad shapes each one covers.</p>
        </div>
      </div>
      <details className="lib-add" open={creatives.length === 0}>
        <summary className="button">Add a creative</summary>
        <UploadForm />
      </details>
      <Library creatives={creatives} />
    </>
  );
}
