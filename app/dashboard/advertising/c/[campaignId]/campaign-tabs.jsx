"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Report / Placements / Creatives / Settings of one campaign, set like the tabs of a developer's game. */
export default function CampaignTabs({ id, creatives }) {
  const path = usePathname();
  const base = `/dashboard/advertising/c/${id}`;
  const tabs = [
    { href: base, label: "Report" },
    { href: `${base}/placements`, label: "Placements" },
    { href: `${base}/creatives`, label: "Creatives", count: creatives },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav className="tabs" aria-label="Campaign sections">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className="tab" aria-current={path === tab.href ? "page" : undefined}>
          {tab.label}
          {tab.count != null && <span className="tab-count">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
