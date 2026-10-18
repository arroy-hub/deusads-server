"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import CategoryIcon from "../../category-icon";
import { REPORT_RANGES, parseRange } from "../../../../../lib/reports";
import { categoryLabel } from "../../../../../lib/categories";
import { TONE } from "../../../_cabinet/dates";
import { STATUS_DOT } from "../../../../../lib/campaign-cover";
import { DateRange, StatusMenu } from "../../../_cabinet/ui";

/**
 * The top of a campaign, set like the top of a developer's game: a picture with the plate on it (the company icon, the
 * name, where it stands and the dates), the status menu and period at the right, and the tabs on the lower edge.
 */
export default function CampaignTop({ h, creatives, coverCss }) {
  const path = usePathname();
  const query = useSearchParams();
  const base = `/dashboard/advertising/c/${h.id}`;
  const days = parseRange(query.get("days") ?? undefined);
  const tone = TONE[h.status.key] ?? "#8c7f73";
  const draft = h.status.key === "draft";
  const tabs = [
    { href: base, label: "Report" },
    { href: `${base}/placements`, label: "Placements" },
    { href: `${base}/creatives`, label: "Creatives", count: creatives },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <div className="gp-top gp-top-card cr-top">
      <div className="gp-cover"><div className="gp-pic" style={{ background: coverCss }} /></div>
      <div className="gp-plate-row">
        <div className="gm-plate gp-plate">
          <span className="gm-icon">
            <span className="rd-tile is-lg cr-top-tile" style={{ "--tone": tone }}>
              <CategoryIcon category={h.category} label={h.category ? categoryLabel(h.category) : "No category yet"} />
            </span>
            <i className="gm-status" style={{ background: STATUS_DOT[h.status.key] ?? "#9aa0a6" }} role="img" aria-label={h.status.label} />
          </span>
          <div>
            <h1>{h.name}</h1>
            <div className="gm-sub"><b style={{ color: tone }}>{h.status.label}</b> · {h.audience || (h.hasBookings ? "Every game" : "Audience not chosen yet")}</div>
          </div>
          <div className="cr-top-dates">
            <DateRange start={h.starts || ""} end={h.ends || ""} tone={tone} paused={h.status.key === "paused"} over={["stopped", "ended"].includes(h.status.key)} animated={!["paused", "stopped", "ended"].includes(h.status.key)} />
          </div>
        </div>
        <div className="cr-top-actions">
          <StatusMenu status={h.status} name={h.name} campaignId={h.id} pausedUntil={h.pausedUntil} locked={!h.rules} />
          {path === base && (
            <>
              <div className="ovx-seg" role="group" aria-label="Period">{REPORT_RANGES.map((r) => <Link key={r} href={`${base}?days=${r}`} aria-current={r === days ? "page" : undefined}>{r} days</Link>)}</div>
              <a className="button button-quiet" href={`/dashboard/advertising/export?kind=placements&days=${days}&campaign=${h.id}`} download>Export CSV</a>
            </>
          )}
          {draft && <Link href={`/dashboard/advertising/new?campaign=${h.id}`} className="button">Continue setup</Link>}
        </div>
      </div>
      <nav className="tabs" aria-label="Campaign sections">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className="tab" aria-current={path === tab.href ? "page" : undefined}>
            {tab.label}
            {tab.count != null && <span className="cp-count" style={{ marginLeft: "0.5rem" }}>{tab.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
