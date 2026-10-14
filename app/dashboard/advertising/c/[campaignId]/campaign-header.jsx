"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import CategoryIcon from "../../category-icon";
import { REPORT_RANGES, parseRange } from "../../../../../lib/reports";
import { categoryLabel } from "../../../../../lib/categories";
import { TONE } from "../../../_cabinet/dates";
import { DateRange, StatusMenu } from "../../../_cabinet/ui";

/**
 * The header every page of a campaign shares: the title with its status (a menu to pause, resume or stop), the dates
 * as a bar, the audience, and at the right the period and the CSV download on the Report, or Continue setup for a draft.
 */
export default function CampaignHeader({ h }) {
  const path = usePathname();
  const query = useSearchParams();
  const base = `/dashboard/advertising/c/${h.id}`;
  const days = parseRange(query.get("days") ?? undefined);
  const tone = TONE[h.status.key] ?? "#8c7f73";
  const draft = h.status.key === "draft";
  return (
    <div className="ch rd-ch">
      <div className="ch-main">
        <p className="ch-crumb"><Link href="/dashboard/advertising">Campaigns</Link> / {h.name}</p>
        <div className="ch-title">
          <span className="rd-tile is-lg" style={{ "--tone": tone }}><CategoryIcon category={h.category} label={h.category ? categoryLabel(h.category) : "No category yet"} /><i className="rd-tile-dot" /></span>
          <h1>{h.name}</h1>
          <StatusMenu status={h.status} name={h.name} campaignId={h.id} pausedUntil={h.pausedUntil} locked={!h.rules} />
        </div>
        <div className="rd-ch-meta">
          <div className="rd-ch-dates"><DateRange start={h.starts || ""} end={h.ends || ""} tone={tone} paused={h.status.key === "paused"} animated={!["paused", "stopped", "ended"].includes(h.status.key)} /></div>
          <span className="rd-ch-aud">{h.audience || (h.hasBookings ? "Every game" : "Audience not chosen yet")}</span>
        </div>
      </div>
      <div className="ch-actions">
        {path === base && (
          <>
            <div className="ovx-seg" role="group" aria-label="Period">{REPORT_RANGES.map((r) => <Link key={r} href={`${base}?days=${r}`} aria-current={r === days ? "page" : undefined}>{r} days</Link>)}</div>
            <a className="button button-quiet" href={`/dashboard/advertising/export?kind=placements&days=${days}&campaign=${h.id}`} download>Export CSV</a>
          </>
        )}
        {draft && <Link href={`/dashboard/advertising/new?campaign=${h.id}`} className="button">Continue setup</Link>}
      </div>
    </div>
  );
}
