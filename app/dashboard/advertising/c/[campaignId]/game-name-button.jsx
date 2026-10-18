"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GameCardPreview from "../../../game-card-preview";
import GameIcon from "../../../game-icon";

const STATE_DOT = { showing: ["#3fb577", "#1f6b3a"], paused: ["#e0a23a", "#8a5a12"], category: ["#e0a23a", "#8a5a12"], blocked: ["#d0503a", "#a1281a"] };

/** A small bubble that opens above the thing that was clicked and closes on Escape or a click elsewhere. */
export function Bubble({ anchor, label, onClose, width = 340, children }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 380;
    setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), top: Math.max(12, r.top - 10 - h) });
  };
  useLayoutEffect(place, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("pointerdown", away); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [anchor, onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div ref={ref} className="gcb" role="dialog" aria-label={label} style={{ width, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}>{children}</div>,
    document.body
  );
}

/**
 * The game's name in a list: a click opens the same card the developer sees in the game's Settings, read-only.
 * `game` is { name, iconUrl, coverCss, form, state, label, views, placements, campaigns }.
 */
export default function GameNameButton({ game, sub = null }) {
  const [open, setOpen] = useState(null);
  const [dot, word] = STATE_DOT[game.state] ?? STATE_DOT.showing;
  return (
    <>
      <span className="cr-gamecell">
        <GameIcon name={game.name} url={game.iconUrl} size="sm" />
        {sub ? (
          <span><button type="button" className="cr-gamelink" aria-haspopup="dialog" aria-expanded={Boolean(open)} onClick={(e) => { const a = e.currentTarget; setOpen(open ? null : a); }}>{game.name}</button><span className="cr-sub">{sub}</span></span>
        ) : (
          <button type="button" className="cr-gamelink" aria-haspopup="dialog" aria-expanded={Boolean(open)} onClick={(e) => { const a = e.currentTarget; setOpen(open ? null : a); }}>{game.name}</button>
        )}
      </span>
      {open && (
        <Bubble anchor={open} label={game.name} onClose={() => setOpen(null)}>
          <GameCardPreview
            form={game.form}
            iconUrl={game.iconUrl}
            coverCss={game.coverCss}
            hasPicture={game.hasPicture}
            colourId=""
            status={{ dot, word, label: game.label, sub: game.views }}
            placements={game.placements}
            campaigns={game.campaigns}
            coversReady={false}
            iconsReady={false}
          />
        </Bubble>
      )}
    </>
  );
}
