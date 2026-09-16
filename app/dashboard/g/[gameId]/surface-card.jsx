"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignCreative } from "../../actions";
import {
  DEFAULT_CROP,
  MAX_ZOOM,
  clampCrop,
  hiddenPercent,
  imagePlacement,
  normalizeCrop,
  ratioLabel,
  sameCrop,
  visibleWindow,
} from "../../../../lib/surface-math";

const SAVED_FOR_MS = 2400;

/**
 * One placement. Every card takes the same room; the placement is drawn inside
 * it at its real proportions. Picking a creative shows it at once; "Framing"
 * lets the user drag and zoom it inside the frame; Save writes both.
 */
export default function SurfaceCard({
  placementId,
  aspect,
  label,
  dims,
  creatives,
  savedCreativeId,
  savedCrop,
  cropEnabled,
}) {
  const router = useRouter();
  const initial = { id: savedCreativeId ?? "", crop: normalizeCrop(savedCrop) };
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [adjusting, setAdjusting] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [note, setNote] = useState(null); // { tone: "error" | "warn", text }
  const [sizes, setSizes] = useState({}); // creative id -> natural aspect, once loaded
  const windowRef = useRef(null);
  const dragRef = useRef(null);
  const timer = useRef(null);
  const preloaded = useRef(false);

  const creative = creatives.find((item) => item.id === draft.id) ?? null;
  const saving = status === "saving";
  const loaded = creative ? sizes[creative.id] !== undefined : true;
  const imageAspect = creative
    ? sizes[creative.id] ??
      (creative.width_px && creative.height_px ? creative.width_px / creative.height_px : aspect)
    : aspect;
  const crop = clampCrop(draft.crop, imageAspect, aspect);
  // Compared after clamping, so zooming in and back out is not a change.
  const dirty =
    draft.id !== saved.id || !sameCrop(crop, clampCrop(saved.crop, imageAspect, aspect));
  const justSaved = status === "saved" && !dirty;
  const place = imagePlacement(imageAspect, aspect, crop);
  const canAdjust = cropEnabled && !!creative && !saving;

  // A background refresh may bring newer values; take them unless mid-edit.
  const incoming = `${savedCreativeId ?? ""}|${savedCrop?.zoom}|${savedCrop?.x}|${savedCrop?.y}`;
  useEffect(() => {
    if (saving) return;
    const next = { id: savedCreativeId ?? "", crop: normalizeCrop(savedCrop) };
    if (next.id === saved.id && sameCrop(next.crop, saved.crop)) return;
    if (!dirty) setDraft(next);
    setSaved(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Wheel zoom while adjusting. Registered by hand: React's wheel listener is
  // passive, so it could not stop the page from scrolling.
  useEffect(() => {
    const node = windowRef.current;
    if (!node || !adjusting) return;
    const onWheel = (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setDraft((d) => ({ ...d, crop: { ...d.crop, zoom: clampZoom(d.crop.zoom * factor) } }));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [adjusting]);

  useEffect(() => {
    if (!canAdjust) setAdjusting(false);
  }, [canAdjust]);

  function touch() {
    clearTimeout(timer.current);
    setStatus((s) => (s === "saving" ? s : "idle"));
    setNote(null);
  }

  function markLoaded(id, img) {
    if (!img?.naturalWidth) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    setSizes((all) => (all[id] === ratio ? all : { ...all, [id]: ratio }));
  }

  // Warm the cache once the user reaches for the list, so switching is instant.
  function preload() {
    if (preloaded.current) return;
    preloaded.current = true;
    for (const item of creatives) {
      if (!item.url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = item.url;
    }
  }

  function pick(event) {
    touch();
    const id = event.target.value;
    // The saved framing belongs to the saved creative; a new one starts centred.
    setDraft({ id, crop: id === saved.id ? saved.crop : DEFAULT_CROP });
  }

  function setCrop(next) {
    touch();
    setDraft((d) => ({ ...d, crop: normalizeCrop(next) }));
  }

  function onPointerDown(event) {
    if (!canAdjust) return;
    if (!adjusting) {
      setAdjusting(true);
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    const win = visibleWindow(imageAspect, aspect, crop.zoom);
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop,
      // px of the whole image, so a drag moves it 1:1 under the pointer
      imageWidth: box.width / win.w,
      imageHeight: box.height / win.h,
    };
    touch();
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const next = {
      zoom: drag.crop.zoom,
      x: drag.crop.x - (event.clientX - drag.startX) / drag.imageWidth,
      y: drag.crop.y - (event.clientY - drag.startY) / drag.imageHeight,
    };
    setDraft((d) => ({ ...d, crop: clampCrop(next, imageAspect, aspect) }));
  }

  function onPointerUp(event) {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  }

  function onKeyDown(event) {
    if (!adjusting) {
      if (canAdjust && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        setAdjusting(true);
      }
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setCrop(clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, imageAspect, aspect));
    } else if (event.key === "+" || event.key === "=") {
      setCrop({ ...crop, zoom: clampZoom(crop.zoom * 1.1) });
    } else if (event.key === "-") {
      setCrop({ ...crop, zoom: clampZoom(crop.zoom / 1.1) });
    } else if (event.key === "Escape") {
      setAdjusting(false);
    }
  }

  async function save() {
    if (!dirty || saving) return;
    clearTimeout(timer.current);
    setStatus("saving");
    setNote(null);
    setAdjusting(false);

    const sent = { id: draft.id, crop: clampCrop(draft.crop, imageAspect, aspect) };
    let result;
    try {
      result = await assignCreative({ placementId, creativeId: sent.id, crop: sent.crop });
    } catch {
      result = { error: "Connection lost. Try again." };
    }

    if (result?.error) {
      setStatus("error");
      setNote({ tone: "error", text: result.error });
      return;
    }

    const stored = { id: sent.id, crop: normalizeCrop(result.crop ?? sent.crop) };
    setSaved(stored);
    setDraft(stored);
    setStatus("saved");
    if (result.warning) setNote({ tone: "warn", text: result.warning });
    timer.current = setTimeout(() => setStatus("idle"), SAVED_FOR_MS);
    router.refresh(); // figures at the top; does not block the card
  }

  let badge = null;
  if (saving) badge = { tone: "busy", text: "Saving…" };
  else if (justSaved) badge = { tone: "done", text: "Saved" };
  else if (dirty) badge = { tone: "draft", text: "Not saved" };

  const frameClass = [
    "surface-frame",
    dirty && !saving && !adjusting ? "is-draft" : "",
    saving ? "is-saving" : "",
    justSaved ? "is-saved" : "",
    adjusting ? "is-adjusting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const imageStyle = {
    width: `${place.width}%`,
    height: `${place.height}%`,
    left: `${place.left}%`,
    top: `${place.top}%`,
  };
  const hidden = creative ? hiddenPercent(imageAspect, aspect, crop.zoom) : 0;
  const framed = !sameCrop(crop, DEFAULT_CROP);

  return (
    <div className={`surface ${adjusting ? "is-adjusting" : ""}`}>
      <div className="surface-stage">
        <div
          ref={windowRef}
          className={`surface-window ${canAdjust ? "can-adjust" : ""}`}
          style={{ "--aspect": aspect, aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          tabIndex={canAdjust ? 0 : -1}
          role={canAdjust ? "button" : undefined}
          aria-label={
            canAdjust
              ? adjusting
                ? "Framing: drag or use arrow keys to move, + and − to zoom, Escape to finish"
                : "Adjust framing"
              : undefined
          }
          title={canAdjust && !adjusting ? "Click to adjust framing" : undefined}
        >
          {adjusting && creative && (
            <img className="surface-ghost" src={creative.url} alt="" style={imageStyle} draggable={false} />
          )}

          <div className={frameClass}>
            {creative ? (
              <img
                key={creative.id}
                ref={(img) => img?.complete && markLoaded(creative.id, img)}
                src={creative.url}
                alt={creative.name}
                decoding="async"
                draggable={false}
                className={loaded ? "is-loaded" : ""}
                style={imageStyle}
                onLoad={(event) => markLoaded(creative.id, event.currentTarget)}
              />
            ) : (
              <div className="surface-empty">Shows your fallback</div>
            )}

            {creative && !loaded && <div className="surface-loading" aria-hidden="true" />}
            {saving && <div className="surface-veil" aria-hidden="true" />}
          </div>

          <div className="surface-badge-slot" role="status" aria-live="polite">
            {badge && (
              <span key={badge.text} className={`surface-badge surface-badge-${badge.tone}`}>
                {badge.tone === "done" && <CheckIcon />}
                {badge.tone === "busy" && <span className="spinner" aria-hidden="true" />}
                {badge.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="surface-body">
        <div className="surface-head">
          <div className="surface-label" title={label}>
            {label}
          </div>
          <div className="surface-dims">{dims}</div>
        </div>

        <select
          className="field surface-select"
          value={draft.id}
          onChange={pick}
          onPointerEnter={preload}
          onFocus={preload}
          disabled={saving}
          aria-label={`Creative for ${label}`}
          title={creative?.name}
        >
          <option value="">No creative</option>
          {creatives.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <div className="surface-form">
          <button
            type="button"
            className={`button button-quiet surface-framing ${adjusting ? "is-on" : ""}`}
            onClick={() => setAdjusting((on) => !on)}
            disabled={!canAdjust}
            aria-pressed={adjusting}
            title={
              cropEnabled
                ? creative
                  ? "Drag and zoom the creative inside the frame"
                  : "Pick a creative first"
                : "Framing needs migration 0003"
            }
          >
            <CropIcon />
            Framing
          </button>
          <button
            type="button"
            className={`button surface-save ${dirty || saving ? "" : "button-quiet"}`}
            onClick={save}
            disabled={!dirty || saving}
            aria-busy={saving}
          >
            {saving ? "Saving…" : justSaved ? "Saved" : "Save"}
          </button>
        </div>

        {adjusting && (
          <div className="surface-adjust">
            <button
              type="button"
              className="icon-button icon-button-small"
              onClick={() => setCrop({ ...crop, zoom: clampZoom(crop.zoom / 1.15) })}
              disabled={crop.zoom <= 1}
              aria-label="Zoom out"
            >
              −
            </button>
            <input
              type="range"
              min="1"
              max={MAX_ZOOM}
              step="0.01"
              value={crop.zoom}
              onChange={(event) => setCrop({ ...crop, zoom: Number(event.target.value) })}
              aria-label="Zoom"
            />
            <button
              type="button"
              className="icon-button icon-button-small"
              onClick={() => setCrop({ ...crop, zoom: clampZoom(crop.zoom * 1.15) })}
              disabled={crop.zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              +
            </button>
            <span className="surface-zoom">{crop.zoom.toFixed(1)}×</span>
            <button
              type="button"
              className="link-button"
              onClick={() => setCrop(DEFAULT_CROP)}
              disabled={!framed}
            >
              Reset
            </button>
            <button type="button" className="link-button" onClick={() => setAdjusting(false)}>
              Done
            </button>
          </div>
        )}

        {note && <div className={note.tone === "error" ? "error surface-note" : "surface-warn"}>{note.text}</div>}

        {adjusting ? (
          <div className="surface-hint">Drag to move · scroll or slider to zoom</div>
        ) : (
          hidden >= 5 &&
          !framed && (
            <div className="surface-warn">
              {hidden}% of the image is cut off. {cropEnabled ? "Use Framing to pick what shows, or" : "Use"} a{" "}
              {ratioLabel(aspect)} file.
            </div>
          )
        )}
      </div>
    </div>
  );
}

function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(1, zoom));
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CropIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 1.5V12h10.5M1.5 4H12v10.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
