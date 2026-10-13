import Link from "next/link";

/** The two tabs of the advertiser's workspace, set like the tabs of a developer's game: Campaigns and Creatives. */
export default function SectionTabs({ active, campaigns, creatives }) {
  const tabs = [
    { key: "campaigns", label: "Campaigns", href: "/dashboard/advertising", count: campaigns },
    { key: "creatives", label: "Creatives", href: "/dashboard/creatives", count: creatives },
  ];
  return (
    <nav className="tabs" aria-label="Campaigns sections">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className="tab" aria-current={tab.key === active ? "page" : undefined}>
          {tab.label}
          {tab.count != null && <span className="tab-count">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
