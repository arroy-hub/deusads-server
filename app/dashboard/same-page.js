"use client";

// A window whose tabs live in the address (?tab=history) without asking the server: its menu entry leads to the same
// page with a bare address. The router does not treat that as a new page, so nothing arrived and the loading veil
// span until it gave up. Such a window says here what the bare address means for it (usually: show the first tab).

import { useEffect, useRef } from "react";

const EVENT = "deusads:same-page";

/**
 * Asks the open page to handle a link to itself (same path, another query). True when a page did: the link is then
 * not followed and nothing is fetched. Called by the loading veil (nav-fade.jsx) for every such click.
 */
export function offerSamePage(url) {
  const event = new CustomEvent(EVENT, { detail: { url }, cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * `handle(url)` is called when a link to this very page (the path the browser shows now) with a bare address is
 * followed. Return false to let the link through.
 */
export function useSamePage(handle) {
  const latest = useRef(handle);
  latest.current = handle;
  useEffect(() => {
    const on = (event) => {
      const url = event.detail?.url;
      if (!url || url.search) return; // a link that names a tab or a filter is a real request
      if (latest.current(url) !== false) event.preventDefault();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
