"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "../../lib/nav";

/** One menu entry; marks itself as the current page and shows its badge. */
const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  overview: "M3 11l9-8 9 8M5 10v10h14V10",
  games: "M3 7h18v11H3zM8 11v3M6.5 12.5h3",
  requests: "M4 4h16v12H8l-4 4z",
  creatives: "M3 4h18v16H3zM3 9h18M8 14h8",
  find: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  campaigns: "M4 6h16M4 12h16M4 18h10",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  modCreatives: "M3 4h18v16H3zM3 9h18M8 14h8",
  applications: "M9 4a4 4 0 100 8 4 4 0 000-8zM2 21c1-6 14-6 15 0",
  disputes: "M6 21V4M6 5h11l-2 4 2 4H6",
  bookings: "M4 6h16M4 12h16M4 18h10",
  users: "M9 4a4 4 0 100 8 4 4 0 000-8zM2 21c1-6 14-6 15 0M17 4a4 4 0 010 8",
  system: "M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3",
};

export default function NavLink({ item }) {
  const pathname = usePathname();
  const active = isActive(item, pathname);
  // On a child's page the child is the current page; its parent only stays open around it.
  const insideChild = item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
  return (
    <>
      <Link
        href={item.href}
        className="rail-link"
        aria-current={active && !insideChild ? "page" : undefined}
        data-open={active && insideChild ? "true" : undefined}
      >
        {ICONS[item.key] && (
          <svg className="rail-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d={ICONS[item.key]} />
          </svg>
        )}
        <span>{item.label}</span>
        {item.badge ? <span className="rail-badge">{item.badge}</span> : null}
      </Link>
      {active && item.children?.length > 0 && (
        <div className="rail-sub" role="group" aria-label={item.label}>
          {item.children.map((child) => (
            <Link key={child.href} href={child.href} className="rail-link rail-child" aria-current={pathname === child.href || pathname.startsWith(`${child.href}/`) ? "page" : undefined}>
              {child.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="rail-game-icon" src={child.icon} alt="" width="20" height="20" />
              ) : (
                <span className="rail-game-icon is-empty" aria-hidden="true">
                  {child.label.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span>{child.label}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
