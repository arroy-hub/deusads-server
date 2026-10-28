"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "../../lib/nav";
import { NAV_ICONS } from "../../lib/nav-icons";

/** One menu entry; marks itself as the current page and shows its badge. */



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
        {NAV_ICONS[item.key] && (
          <svg className="rail-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d={NAV_ICONS[item.key]} />
          </svg>
        )}
        <span>{item.label}</span>
        {item.badge ? <span className={`rail-badge${item.key === "system" ? " is-warn" : ""}`}>{item.badge}</span> : null}
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
