"use client";

import { useContext, useEffect, useState } from "react";
import { PanelCtx } from "../panel-context";
import DeckBoard from "../deck-board";
import { loadGamesDeck } from "./games-deck-actions";

/** The Statistics panel of My games: the widgets of a game, added up over the chosen games, fetched once the page is on screen. */
export default function GamesDeck({ days, games, source, series, initial = null }) {
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const frameOpen = useContext(PanelCtx);
  const key = `${days}|${games.join(",")}`;

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadGamesDeck({ days, games })
      .then((next) => {
        if (!live) return;
        if (next) setModel(next);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  if (!model) {
    // the panel keeps its place while the figures are on their way, so nothing jumps in
    return frameOpen === false ? null : (
      <div className="dk dk-side dk-skel" aria-busy="true" aria-label="Statistics, loading">
        <div className="dk-skel-head"><h3 className="dk-side-title">Statistics</h3></div>
        <div className="dk-skel-grid">
          <i style={{ gridColumn: "span 6", height: 118 }} />
          <i style={{ gridColumn: "span 6", height: 118 }} />
          <i style={{ gridColumn: "span 12", height: 96 }} />
          <i style={{ gridColumn: "span 12", height: 96 }} />
        </div>
      </div>
    );
  }
  return (
    <DeckBoard
      kind="developer"
      model={model}
      source={source}
      days={series}
      initial={initial}
      scope="The chosen games added up, same period as the chart. Players and sessions are counted per game."
      panel
    />
  );
}
