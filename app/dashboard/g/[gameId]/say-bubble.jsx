"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeByAnchor } from "../../bubble";

// Every short message of the Placements tab ("ID copied", "Shown in Unity", an error, a move with its Undo) is a
// small dark bubble next to the button that was pressed, and it leaves by itself. Nothing is drawn over the list.

/** How long a bubble stays, the same for good news and for errors. */
export const SAY_MS = 3000;

const WIDTH = 270;
const GAP = 8;

function visibleRect(node) {
  if (!node || !node.isConnected) return null;
  const box = node.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
}

/**
 * Where a message belongs. `el` is what was pressed; `alt` stands in when that is gone by the time the answer
 * arrives (a menu item closes with its menu, so its "⋮" button takes over); `cardId` and `groupId` name a card or
 * a folder to find afresh, because a card may have moved; `rect` is where the press was, as the last resort.
 */
function placeOf(at) {
  if (!at) return null;
  if (at.cardId != null) {
    const card = document.querySelector(`[data-card="${CSS.escape(String(at.cardId))}"]`);
    const found = visibleRect(card?.querySelector("[data-popbtn]")) ?? visibleRect(card);
    if (found) return found;
  }
  if (at.groupId != null) {
    const group = document.querySelector(`[data-group="${CSS.escape(String(at.groupId))}"]`);
    const found = visibleRect(group?.querySelector(".org-group-head, summary, header") ?? null) ?? visibleRect(group);
    if (found) return { ...found, bottom: Math.min(found.bottom, found.top + 44), height: Math.min(found.height, 44) };
  }
  return visibleRect(at.el) ?? visibleRect(at.alt) ?? at.rect ?? null;
}

/** What was pressed, kept so that an answer arriving later still knows where to appear. */
export function pressOf(target, popId) {
  if (!target || !target.closest) return null;
  const el = target.closest("button, a, [role='menuitem'], input, select, summary, label") ?? target;
  const rect = visibleRect(el);
  if (!rect) return null;
  const inMenu = popId != null && target.closest(".org-pop");
  const alt = inMenu ? document.querySelector(`[data-card="${CSS.escape(String(popId))}"] [data-popbtn]`) : null;
  return { el, alt, rect };
}

/** The bubble itself. `notice` is { kind, text, undo?, at, n }; a new `n` restarts the three seconds. */
export function SayBubble({ notice, onDone }) {
  const [pos, setPos] = useState(null);
  const [held, setHeld] = useState(false);
  const box = useRef(null);

  useLayoutEffect(() => {
    if (!notice) return setPos(null);
    function place() {
      const r = placeOf(notice.at);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - 16);
      if (!r) return setPos({ left: (vw - width) / 2, width, top: 72, arrow: null, above: false });
      // all of it on the screen: below the button, above when there is no room, moved over it when neither fits
      const spot = placeByAnchor(r, width, box.current?.offsetHeight ?? 60, { gap: GAP, view: { width: vw, height: vh } });
      setPos({ left: spot.left, width, arrow: spot.moved ? null : spot.arrow, above: spot.above, top: spot.top });
    }
    place();
    // the list settles a moment after the server's answer (a card that moved, a menu that closed)
    const again = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(again);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [notice]);

  // Three seconds for everything. The count waits while the pointer rests on the bubble, so Undo can be reached.
  useEffect(() => {
    if (!notice || held) return undefined;
    const timer = setTimeout(onDone, SAY_MS);
    return () => clearTimeout(timer);
  }, [notice, held, onDone]);
  useEffect(() => setHeld(false), [notice]);

  if (!notice || typeof document === "undefined") return null;
  const style = pos
    ? { left: pos.left, width: pos.width, top: pos.top }
    : { left: 0, top: 0, width: WIDTH, visibility: "hidden" };
  return createPortal(
    <div
      ref={box}
      className={`ig-bubble org-say${pos?.above ? " is-above" : ""}${notice.kind === "error" ? " is-error" : ""}`}
      role={notice.kind === "error" ? "alert" : "status"}
      style={style}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      {pos?.arrow != null && <span className="ig-bubble-arrow" style={{ left: pos.arrow }} />}
      {notice.text}
      {notice.undo && (
        <button type="button" className="org-say-undo" onClick={notice.undo}>
          Undo
        </button>
      )}
    </div>,
    document.body
  );
}
