"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SHOW_AFTER = 160; // ms: a page that opens at once never flashes the veil
const GIVE_UP = 20000; // ms: if something went wrong, the veil never stays

/**
 * A light veil with a spinner over the right-hand part of the site while the next page is being fetched from the server.
 * It starts when an internal link is followed (or a component says `deusads:navigating` before it calls router.push)
 * and ends when the address changes. Pages that open within a moment show nothing at all.
 */
export default function NavFade() {
  const path = usePathname();
  const query = useSearchParams()?.toString() ?? "";
  const here = `${path}?${query}`;
  const [on, setOn] = useState(false);
  const [left, setLeft] = useState(0);
  const later = useRef(null);
  const giveUp = useRef(null);

  // The address changed: the next page has arrived.
  useEffect(() => {
    clearTimeout(later.current);
    clearTimeout(giveUp.current);
    setOn(false);
  }, [here]);

  useEffect(() => {
    const begin = () => {
      clearTimeout(later.current);
      later.current = setTimeout(() => {
        setLeft(document.querySelector(".rail")?.getBoundingClientRect().right ?? 0);
        setOn(true);
        clearTimeout(giveUp.current);
        giveUp.current = setTimeout(() => setOn(false), GIVE_UP);
      }, SHOW_AFTER);
    };
    const click = (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page or only a #anchor
      begin();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("deusads:navigating", begin);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("deusads:navigating", begin);
      clearTimeout(later.current);
      clearTimeout(giveUp.current);
    };
  }, []);

  return (
    <div className={`nav-fade${on ? " is-on" : ""}`} style={{ left }} role="status" aria-live="polite" aria-hidden={!on}>
      <span className="nav-fade-spin" />
      <span className="nav-fade-text">Loading</span>
    </div>
  );
}
