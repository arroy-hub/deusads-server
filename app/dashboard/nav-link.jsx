"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "../../lib/nav";

/** One menu entry; marks itself as the current page and shows its badge. */
export default function NavLink({ item }) {
  const pathname = usePathname();
  const active = isActive(item, pathname);
  return (
    <>
      <Link href={item.href} className="rail-link" aria-current={active ? "page" : undefined}>
        <span>{item.label}</span>
        {item.badge ? <span className="rail-badge">{item.badge}</span> : null}
      </Link>
      {active &&
        item.children?.map((child) => (
          <Link key={child.href} href={child.href} className="rail-link rail-child" aria-current={pathname === child.href ? "page" : undefined}>
            {child.label}
          </Link>
        ))}
    </>
  );
}
