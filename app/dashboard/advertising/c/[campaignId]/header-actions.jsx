"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PauseButton } from "../../campaign-actions";
import { REPORT_RANGES, parseRange } from "../../../../../lib/reports";

/**
 * The buttons at the right of a campaign's header. Every tab has Pause campaign; the Report also has its period
 * and the CSV download, as in the mockup. A draft has Continue setup instead.
 */
export default function HeaderActions({ id, paused, canPause, rules, draft }) {
  const path = usePathname();
  const query = useSearchParams();
  const base = `/dashboard/advertising/c/${id}`;
  const onReport = path === base;
  const days = parseRange(query.get("days") ?? undefined);

  return (
    <div className="ch-actions">
      {onReport && (
        <>
          <div className="ovx-seg" role="group" aria-label="Period">
            {REPORT_RANGES.map((range) => (
              <Link key={range} href={`${base}?days=${range}`} aria-current={range === days ? "page" : undefined}>
                {range} days
              </Link>
            ))}
          </div>
          <a className="button button-quiet" href={`/dashboard/advertising/reports/export?kind=placements&days=${days}&campaign=${id}`} download>
            Export CSV
          </a>
        </>
      )}
      {draft ? (
        <Link href={`/dashboard/advertising/new?campaign=${id}`} className="button">
          Continue setup
        </Link>
      ) : (
        rules && canPause && <PauseButton id={id} paused={paused} full />
      )}
    </div>
  );
}
