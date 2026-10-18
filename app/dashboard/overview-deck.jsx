"use client";

import { useEffect, useState } from "react";
import DeckBoard from "./deck-board";
import { loadOverviewDeck } from "./deck-actions";

/** "Advanced Data" under the Overview chart: the widgets for all campaigns together, fetched once the page is on screen. */
export default function OverviewDeck({ days, series, initial = null }) {
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadOverviewDeck({ days }).then((m) => { if (!live) return; if (m) setModel(m); else setFailed(true); }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [days]);
  if (failed) return null;
  if (!model) {
    // the same link while the figures are on their way, so nothing jumps in
    return (
      <div className="dk">
        <span className="dk-link is-wait" aria-busy="true">
          Advanced Data
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    );
  }
  return <DeckBoard kind="advertiser" model={model} days={series} initial={initial} scope="Across all your campaigns, whatever is ticked in the table." />;
}
