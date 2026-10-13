import Link from "next/link";

const STATUS = {
  approved: ["Approved", "ov-live"],
  pending: ["In review", "ov-scheduled"],
  rejected: ["Rejected", "ov-bad"],
};

function hint(item) {
  if (item.status === "rejected") return item.note ? `Reason: ${item.note}. Upload a corrected one.` : "Upload a corrected one.";
  if (item.status === "pending") return "Ads start once it is approved";
  if (item.missingLabels.length > 0) return `${item.missingLabels.length} ${item.missingLabels.length === 1 ? "shape" : "shapes"} missing: ${item.missingLabels.join(", ")}`;
  return "All shapes covered";
}

/** The advertiser's creative cards: picture, status, how many standard shapes have a picture, and where it is used. A card opens the editor. */
export default function Library({ creatives }) {
  if (creatives.length === 0) {
    return (
      <div className="empty cl-empty">
        <h2>No creatives yet</h2>
        <p>A creative is the picture you advertise with. Add one while you set up a campaign; it stays here for every campaign after that.</p>
        <Link href="/dashboard/advertising/new" className="button">
          Start a campaign with a creative
        </Link>
      </div>
    );
  }
  return (
    <div className="lib-list">
      {creatives.map((item) => {
        const [label, tone] = STATUS[item.status] ?? STATUS.pending;
        const ready = item.formats.filter((format) => format.ready).length;
        return (
          <Link key={item.id} href={`/dashboard/creatives/${item.id}`} className="panel lib-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="lib-thumb" src={item.url} alt="" loading="lazy" />
            <span className="lib-main">
              <strong>{item.name}</strong>
              <span className={`ov-pill ${tone}`}>{label}</span>
            </span>
            <span className="lib-bar" role="img" aria-label={`${ready} of ${item.formats.length} formats ready`}>
              {item.formats.map((format) => (
                <span key={format.id} className={format.ready ? "" : "is-missing"} title={format.id} />
              ))}
            </span>
            <span className="lib-hint">{hint(item)}</span>
            <span className="lib-hint">{item.campaigns === 0 ? "Not in use" : `In ${item.campaigns} ${item.campaigns === 1 ? "campaign" : "campaigns"}`}</span>
          </Link>
        );
      })}
    </div>
  );
}
