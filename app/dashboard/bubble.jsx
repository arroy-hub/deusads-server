"use client";

// A dark bubble by the thing it explains (the "i" hints and the like), always whole on the screen: it opens below its
// anchor, above when there is no room below, and when it fits on neither side it is moved to where all of it shows.
// The bubble is measured after it is drawn, so its real height decides, not a guess.

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const clamp = (value, low, high) => Math.min(Math.max(low, high), Math.max(low, value));

/**
 * Where a box of `width` x `height` goes by an anchor (a DOMRect) so that all of it is on the screen:
 * { left, top, above, arrow, moved }. `arrow` is the x of the anchor's middle inside the box; `moved` is true when the
 * box had to slide over the anchor to fit (then it has no arrow). `prefer` is the side tried first.
 */
export function placeByAnchor(rect, width, height, { gap = 8, edge = 8, prefer = "below", view = null } = {}) {
  const vw = view?.width ?? window.innerWidth;
  const vh = view?.height ?? window.innerHeight;
  const middle = rect.left + rect.width / 2;
  const left = clamp(middle - width / 2, edge, vw - width - edge);
  const below = rect.bottom + gap;
  const over = rect.top - gap - height;
  const fitsBelow = below + height <= vh - edge;
  const fitsAbove = over >= edge;
  // the preferred side when it fits, else the other when that fits, else the roomier one
  const above = prefer === "above" ? fitsAbove || (!fitsBelow && rect.top > vh - rect.bottom) : !fitsBelow && (fitsAbove || rect.top > vh - rect.bottom);
  const wanted = above ? over : below;
  const top = clamp(wanted, edge, vh - height - edge);
  return { left, top, above, arrow: clamp(middle - left, 12, width - 12), moved: Math.abs(top - wanted) > 0.5 };
}

/**
 * The bubble itself, drawn over everything. `rect` is the anchor's place on the screen (getBoundingClientRect()).
 * Children are the content; `className` adds to "ig-bubble".
 */
export function AnchoredBubble({ rect, width = 270, className = "", role = "tooltip", prefer = "below", children, ...rest }) {
  const box = useRef(null);
  const [place, setPlace] = useState(null);
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    if (!box.current || !rect) return;
    const w = Math.min(width, window.innerWidth - 16);
    setSize(w);
    box.current.style.width = `${w}px`;
    setPlace(placeByAnchor(rect, w, box.current.offsetHeight, { prefer }));
  }, [rect, width, prefer, children]);
  if (typeof document === "undefined" || !rect) return null;
  const style = place
    ? { left: place.left, top: place.top, width: size, maxHeight: "calc(100vh - 16px)" }
    : { left: 0, top: 0, width: size ?? width, visibility: "hidden" };
  return createPortal(
    <div ref={box} className={`ig-bubble${place?.above ? " is-above" : ""}${className ? ` ${className}` : ""}`} role={role} style={style} {...rest}>
      {place && !place.moved && <span className="ig-bubble-arrow" style={{ left: place.arrow }} />}
      {children}
    </div>,
    document.body
  );
}
