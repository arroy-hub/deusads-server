import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "../../../../../../lib/admin";
import { canAdvertise } from "../../../../../../lib/admin-rules";
import { loadCampaignReport, loadCreativeLibrary } from "../../../../../../lib/advertiser-data";
import { formatCount } from "../../../../../../lib/analytics";
import RemoveCreative from "./remove-creative";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign creatives" };

const STATUS = { approved: ["Approved", "ov-live"], pending: ["In review", "ov-scheduled"], rejected: ["Rejected", "ov-bad"] };

export default async function CampaignCreativesPage({ params }) {
  const { campaignId } = await params;
  const me = await getMember();
  if (!me || !canAdvertise(me.role)) notFound();
  const [report, library] = await Promise.all([loadCampaignReport(me.service, me, campaignId, 30), loadCreativeLibrary(me.service, me)]);
  if (!report) notFound();

  const ids = [...new Set(report.bookings.map((booking) => booking.creativeId))];
  const byId = new Map(library.creatives.map((item) => [item.id, item]));
  // Impressions and view time of each creative in this campaign, from the placement figures.
  const figures = new Map();
  for (const item of report.placementStats) {
    const entry = figures.get(item.creative_id) ?? { impressions: 0, weighted: 0, weight: 0 };
    const count = Number(item.impressions) || 0;
    entry.impressions += count;
    if (item.avg_visible_seconds != null) {
      entry.weighted += Number(item.avg_visible_seconds) * count;
      entry.weight += count;
    }
    figures.set(item.creative_id, entry);
  }
  const openOf = (id) => report.bookings.filter((booking) => booking.creativeId === id && (booking.status === "approved" || booking.status === "pending")).length;

  return (
    <>
      <div className="cc-head">
        <p>Creatives this campaign rotates, with their numbers for the last 30 days.</p>
        <div className="cc-head-actions">
          <Link href={`/dashboard/advertising/new?campaign=${campaignId}`} className="button button-quiet">
            Pick from my library
          </Link>
          <Link href="/dashboard/creatives" className="button">
            Upload new
          </Link>
        </div>
      </div>
      {ids.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>No creatives in this campaign yet.</p>
        </div>
      ) : (
        <section className="cc-list" aria-label="Creatives in this campaign">
          {ids.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            const [label, tone] = STATUS[item.status] ?? STATUS.pending;
            const ready = item.formats.filter((format) => format.ready).length;
            const figure = figures.get(id);
            const blocked = [...new Set(report.bookings.filter((booking) => booking.creativeId === id && booking.controlNote).map((booking) => booking.game))];
            const longer = report.creativeRows.find((row) => row.id === id)?.longer;
            const note = blocked.length > 0 ? `Blocked in ${blocked.length} ${blocked.length === 1 ? "game" : "games"}: ${blocked.join(", ")}` : item.status === "pending" ? "Ads start once it is approved" : item.status === "rejected" ? item.note || "Rejected" : "";
            return (
              <div key={id} className="cc-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.url ? <img className="cc-thumb" src={item.url} alt="" loading="lazy" /> : <span className="cc-thumb" />}
                <span className="cc-main">
                  <span className="cc-name">
                    <Link href={`/dashboard/creatives/${id}`}>{item.name}</Link>
                    {longer && <span className="ov-pill ov-live">Longer views</span>}
                  </span>
                  {note && <span className="ovx-muted">{note}</span>}
                </span>
                <span className="cc-state">
                  <span className={`ov-pill ${tone}`}>{label}</span>
                  <span className="lib-bar" role="img" aria-label={`${ready} of ${item.formats.length} formats ready`}>
                    {item.formats.map((format) => (
                      <span key={format.id} className={format.ready ? "" : "is-missing"} title={format.id} />
                    ))}
                  </span>
                </span>
                <span className="lib-num">
                  <strong>{figure && figure.impressions > 0 ? formatCount(figure.impressions) : "—"}</strong>
                  <span>impressions</span>
                </span>
                <span className="lib-num">
                  <strong>{figure && figure.weight > 0 ? `${(figure.weighted / figure.weight).toFixed(1)} s` : "—"}</strong>
                  <span>avg view</span>
                </span>
                <span className="cc-actions">
                  <Link href={`/dashboard/creatives/${id}`} className="button button-quiet button-small">
                    Edit
                  </Link>
                  <RemoveCreative campaignId={campaignId} creativeId={id} name={item.name} open={openOf(id)} />
                </span>
              </div>
            );
          })}
        </section>
      )}
      <p className="ovx-hint">
        Removing a creative here only takes it out of this campaign; it stays in your library.
      </p>
    </>
  );
}
