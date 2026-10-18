"use client";

import { useEffect, useRef, useState } from "react";
import MetricsDeck from "./metrics-deck";
import { saveDeckLayout } from "./deck-actions";

const keyOf = (kind) => `dk-layout-${kind}`;
const readPending = (kind) => {
  try {
    const raw = window.localStorage.getItem(keyOf(kind));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writePending = (kind, layout) => { try { window.localStorage.setItem(keyOf(kind), JSON.stringify(layout)); } catch {} };
const clearPending = (kind) => { try { window.localStorage.removeItem(keyOf(kind)); } catch {} };

/**
 * The widget board with its layout kept in the account. A change is kept in this browser at once and sent to the account a moment
 * later (or when the page is left); the browser's copy is dropped once the account has it, so it only outlives a save that did not land.
 */
export default function DeckBoard({ kind, initial = null, ...rest }) {
  const timer = useRef(null);
  const latest = useRef(null);
  const [start, setStart] = useState({ initial, version: 0 });

  // a layout the account never received (the page was left too fast, or the save failed) wins over the account's older copy
  useEffect(() => {
    const pending = readPending(kind);
    if (pending && typeof pending === "object") setStart({ initial: pending, version: 1 });
  }, [kind]);

  const flush = () => {
    clearTimeout(timer.current);
    if (!latest.current) return;
    const layout = latest.current;
    latest.current = null;
    saveDeckLayout({ kind, layout })
      .then((result) => { if (result?.ok && !latest.current) clearPending(kind); })
      .catch(() => null);
  };
  useEffect(() => {
    const leave = () => flush();
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hide);
      flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = (layout) => {
    latest.current = layout;
    writePending(kind, layout);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  };
  return <MetricsDeck key={start.version} kind={kind} initial={start.initial} onChange={onChange} {...rest} />;
}
