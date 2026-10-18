"use client";

import { useEffect, useRef } from "react";
import MetricsDeck from "./metrics-deck";
import { saveDeckLayout } from "./deck-actions";

/** The widget board with its layout kept in the account: changes are sent a moment after the last one. */
export default function DeckBoard({ kind, initial = null, ...rest }) {
  const timer = useRef(null);
  const latest = useRef(null);
  const flush = () => {
    if (!latest.current) return;
    const layout = latest.current;
    latest.current = null;
    saveDeckLayout({ kind, layout }).catch(() => null);
  };
  useEffect(() => () => { clearTimeout(timer.current); flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = (layout) => {
    latest.current = layout;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  return <MetricsDeck kind={kind} initial={initial} onChange={onChange} {...rest} />;
}
