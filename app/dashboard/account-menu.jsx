"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "./account/actions";

/**
 * The account block under the wordmark in the side menu: the picture, the company name and the email.
 * A click opens two items, Your account and Sign out. It is filled with the brand colour while the
 * person's own account page is open. A yellow dot on the picture (and "Needs attention" in the menu)
 * shows while the company name is empty or an email change waits for its link.
 */
export default function AccountMenu({ company, email, avatarUrl, initials, attention }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef(null);
  const current = pathname === "/dashboard/account";
  const name = company.trim();

  useEffect(() => {
    if (!open) return;
    const away = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="rail-acct">
      <div className="acc-wrap" ref={box}>
        {open && (
          <div className="acc-pop" role="menu">
            <Link className="it" role="menuitem" href="/dashboard/account" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-6 15-6 16 0" />
              </svg>
              Your account
              {attention && <small>Needs attention</small>}
            </Link>
            <button className="it" type="button" role="menuitem" disabled={pending} onClick={() => start(() => signOut())}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />
              </svg>
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
        <button
          type="button"
          className={`rail-account${open ? " is-open" : ""}`}
          aria-current={current ? "page" : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Your account"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="av-wrap">
            <span className="av" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}>
              {avatarUrl ? "" : initials}
            </span>
            {attention && <span className="av-dot" />}
          </span>
          <span className="who">
            <b className={name ? undefined : "is-missing"}>{name || "Add company name"}</b>
            <span>{email}</span>
          </span>
          <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M7 10l5 5 5-5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
