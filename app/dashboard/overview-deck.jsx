"use client";

import { useEffect, useState } from "react";
import DeckBoard from "./deck-board";
import { loadOverviewDeck } from "./deck-actions";

/** "Advanced Data" under the Overview chart: the widgets for all campaigns together, fetched once the page is on screen. */
export default function OverviewDeck({ days, series, initial = null }) {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let live = true;
    loadOverviewDeck({ days }).then((m) => { if (live && m) setModel(m); }).catch(() => null);
    return () => { live = false; };
  }, [days]);
  if (!model) return null;
  return <DeckBoard kind="advertiser" model={model} days={series} initial={initial} scope="Across all your campaigns, whatever is ticked in the table." />;
}
