"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addOwnCreative, deleteOwnCreative, saveOwnCreative } from "../../actions";
import { browserClient } from "../../../../lib/supabase-browser";
import { CardChips, CardName, CardOverlay, CardSections, CardStatus, useOrg } from "./placement-card";
import { MAX_OWN_CREATIVES, OWN_PICTURE_MAX_BYTES, OWN_PICTURE_TYPES } from "../../../../lib/own-creatives";
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
 * One placement. Every card takes the same room; the placement is drawn inside it at its real
 * proportions. The developer's own pictures (up to MAX_OWN_CREATIVES) sit in a row under it: they
 * show here in turn whenever no advertiser is booked. Choose one to see it in the frame, add more
 * with +, and for the chosen one switch it on or off, frame it (drag and zoom; Save writes the
 * framing) or delete it. `items` are { assignmentId, id, name, url, width_px, height_px, enabled, crop }.
 */
export default function SurfaceCard({ placementId, aspect, label, dims, items: serverItems, cropEnabled, children }) {
  const router = useRouter();
  const org = useOrg(placementId); // set only on the Placements tab of a game that has the organiser
  // On/off flips on screen at once; the server catches up in the background (and the flip is undone on a failure).
  const [flags, setFlags] = useState({}); // assignmentId -> enabled, until the page brings the same value
  // A picture just added shows from the local file at once; the page's own copy replaces it when it arrives.
  const [pending, setPending] = useState([]);
  const [gone, setGone] = useState([]); // assignment ids deleted on screen, until the page drops them too
  const pendingRef = useRef([]);
  pendingRef.current = pending;
  const items = [
    ...serverItems.filter((item) => !gone.includes(item.assignmentId)).map((item) => (item.assignmentId in flags ? { ...item, enabled: flags[item.assignmentId] } : item)),
    ...pending.filter((item) => !serverItems.some((own) => own.assignmentId === item.assignmentId)),
  ];
  const fileRef = useRef(null);
  const [selectedId, setSelectedId] = useState(serverItems[0]?.assignmentId ?? "");
  const [savedCrops, setSavedCrops] = useState(() => cropsOf(serverItems));
  const [drafts, setDrafts] = useState({}); // assignmentId -> crop not saved yet
  const [adjusting, setAdjusting] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [busy, setBusy] = useState(""); // "" | "adding" | "deleting" | "toggling"
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState(null); // { tone: "error" | "warn", text }
  const [sizes, setSizes] = useState({}); // picture id -> natural aspect, once loaded
  const windowRef = useRef(null);
  const dragRef = useRef(null);
  const timer = useRef(null);

  const creative = items.find((item) => item.assignmentId === selectedId) ?? items[0] ?? null;
  const activeId = creative?.assignmentId ?? "";
  const saving = status === "saving";
  const working = saving || busy !== "";
  const loaded = creative ? sizes[creative.id] !== undefined : true;
  const imageAspect = creative
    ? sizes[creative.id] ??
      (creative.width_px && creative.height_px ? creative.width_px / creative.height_px : aspect)
    : aspect;
  const savedCrop = savedCrops[activeId] ?? DEFAULT_CROP;
  const crop = clampCrop(drafts[activeId] ?? savedCrop, imageAspect, aspect);
  // Compared after clamping, so zooming in and back out is not a change.
  const dirty = !!creative && !sameCrop(crop, clampCrop(savedCrop, imageAspect, aspect));
  const justSaved = status === "saved" && !dirty;
  const place = imagePlacement(imageAspect, aspect, crop);
  const canAdjust = cropEnabled && !!creative && !working;

  // A refresh may bring newer pictures or framing: take them, keeping edits that are still open.
  const incoming = serverItems.map((item) => `${item.assignmentId}:${item.enabled}:${item.crop.zoom}:${item.crop.x}:${item.crop.y}`).join("|");
  useEffect(() => {
    setSavedCrops(cropsOf(serverItems));
    setFlags({});
    setGone((all) => all.filter((id) => serverItems.some((own) => own.assignmentId === id)));
    setPending((all) => {
      const arrived = all.filter((item) => serverItems.some((own) => own.assignmentId === item.assignmentId));
      arrived.forEach((item) => URL.revokeObjectURL(item.url));
      return all.filter((item) => !arrived.includes(item));
    });
    setSelectedId((current) =>
      serverItems.some((item) => item.assignmentId === current) || pendingRef.current.some((item) => item.assignmentId === current)
        ? current
        : serverItems[0]?.assignmentId ?? ""
    );
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
      setDrafts((all) => ({ ...all, [activeId]: { ...(all[activeId] ?? savedCrops[activeId] ?? DEFAULT_CROP), zoom: clampZoom((all[activeId] ?? savedCrops[activeId] ?? DEFAULT_CROP).zoom * factor) } }));
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

  function choose(assignmentId) {
    if (working || assignmentId === activeId) return;
    touch();
    setAdjusting(false);
    setConfirmDelete(false);
    setSelectedId(assignmentId);
  }

  function setCrop(next) {
    touch();
    setDrafts((all) => ({ ...all, [activeId]: normalizeCrop(next) }));
  }

  // Framing opens only from the Framing button, never from a click on the picture.
  function onPointerDown(event) {
    if (!canAdjust || !adjusting) return;
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
    setDrafts((all) => ({ ...all, [activeId]: clampCrop(next, imageAspect, aspect) }));
  }

  function onPointerUp(event) {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  }

  function onKeyDown(event) {
    if (!adjusting) return;
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
    if (!dirty || working) return;
    clearTimeout(timer.current);
    setStatus("saving");
    setNote(null);
    setAdjusting(false);

    const sent = clampCrop(drafts[activeId] ?? savedCrop, imageAspect, aspect);
    let result;
    try {
      result = await saveOwnCreative({ assignmentId: activeId, crop: sent });
    } catch {
      result = { error: "Connection lost. Try again." };
    }

    if (result?.error) {
      setStatus("error");
      setNote({ tone: "error", text: result.error });
      return;
    }

    const stored = normalizeCrop(result.crop ?? sent);
    setSavedCrops((all) => ({ ...all, [activeId]: stored }));
    setDrafts(({ [activeId]: _done, ...rest }) => rest);
    setStatus("saved");
    timer.current = setTimeout(() => setStatus("idle"), SAVED_FOR_MS);
    router.refresh(); // figures at the top; does not block the card
  }

  function cancelFraming() {
    setDrafts(({ [activeId]: _discard, ...rest }) => rest);
    setAdjusting(false);
    setStatus("idle");
  }

  async function toggle() {
    if (!creative) return;
    const id = activeId;
    const next = !creative.enabled;
    setNote(null);
    setFlags((all) => ({ ...all, [id]: next })); // shown at once
    const result = await saveOwnCreative({ assignmentId: id, enabled: next }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setFlags((all) => ({ ...all, [id]: !next })); // undo
      setNote({ tone: "error", text: result.error });
    }
    // The save already refreshed the page data; nothing more to wait for here.
  }

  async function remove() {
    if (!creative || working) return;
    if (!confirmDelete) return setConfirmDelete(true);
    const id = activeId;
    const at = items.findIndex((item) => item.assignmentId === id);
    const neighbour = items[at + 1] ?? items[at - 1] ?? null;
    setNote(null);
    setAdjusting(false);
    setConfirmDelete(false);
    // Gone from the card at once; the server catches up in the background (and the picture comes back on a failure).
    setGone((all) => [...all, id]);
    setSelectedId(neighbour?.assignmentId ?? "");
    setDrafts(({ [id]: _gone, ...rest }) => rest);
    const result = await deleteOwnCreative({ assignmentId: id }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setGone((all) => all.filter((goneId) => goneId !== id));
      setSelectedId(id);
      setNote({ tone: "error", text: result.error });
    }
  }

  async function addPicture(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || working) return;
    if (!OWN_PICTURE_TYPES[file.type]) return setNote({ tone: "error", text: "Pictures must be PNG or JPG." });
    if (file.size > OWN_PICTURE_MAX_BYTES) return setNote({ tone: "error", text: "Pictures must be under 8 MB." });

    setBusy("adding");
    setNote(null);
    setAdjusting(false);
    setConfirmDelete(false);
    const tempId = `pending-${crypto.randomUUID()}`;
    const localUrl = URL.createObjectURL(file);
    try {
      const size = await measure(file);
      // The picture is on the card straight away, from the file on this computer.
      setPending((all) => [
        ...all,
        {
          assignmentId: tempId,
          id: tempId,
          name: file.name.replace(/\.[^.]+$/, ""),
          url: localUrl,
          width_px: size.width,
          height_px: size.height,
          enabled: true,
          crop: DEFAULT_CROP,
          uploading: true,
        },
      ]);
      setSelectedId(tempId);
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) throw new Error("Your session expired. Sign in again.");
      const path = `${userId}/${crypto.randomUUID()}.${OWN_PICTURE_TYPES[file.type]}`;
      const { error: uploadError } = await db.storage
        .from("creatives")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (uploadError) throw new Error("Upload failed. Try again.");
      const result = await addOwnCreative({
        placementId,
        path,
        name: file.name.replace(/\.[^.]+$/, ""),
        type: file.type,
        size: file.size,
        width: size.width,
        height: size.height,
      });
      if (result?.error) throw new Error(result.error);
      // Same picture, now with its real id. The save has already refreshed the page data.
      setPending((all) => all.map((item) => (item.assignmentId === tempId ? { ...item, assignmentId: result.assignmentId, id: result.creativeId ?? item.id, uploading: false } : item)));
      setSelectedId(result.assignmentId);
    } catch (error) {
      setPending((all) => all.filter((item) => item.assignmentId !== tempId));
      URL.revokeObjectURL(localUrl);
      setSelectedId((current) => (current === tempId ? serverItems[0]?.assignmentId ?? "" : current));
      setNote({ tone: "error", text: error?.message || "Could not add the picture. Try again." });
    } finally {
      setBusy("");
    }
  }

  let badge = null;
  if (busy === "adding") badge = { tone: "busy", text: "Adding…" };
  else if (saving) badge = { tone: "busy", text: "Saving…" };
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
    <div className={`surface ${adjusting ? "is-adjusting" : ""}${org?.item.enabled === false ? " is-switched-off" : ""}`}>
      {org && (
        <div className="org-namerow">
          <CardName placementId={placementId} label={label} />
        </div>
      )}
      <div className="surface-stage">
        <div
          ref={windowRef}
          className="surface-window"
          style={{ "--aspect": aspect, aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          tabIndex={adjusting ? 0 : -1}
          role={adjusting ? "button" : undefined}
          aria-label={adjusting ? "Framing: drag or use arrow keys to move, + and − to zoom, Escape to finish" : undefined}
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
              <div className="surface-empty">No pictures of your own yet</div>
            )}

            {creative && !loaded && <div className="surface-loading" aria-hidden="true" />}
            {saving && <div className="surface-veil" aria-hidden="true" />}
          </div>

          {creative && items.length > 0 && (
            <span className="own-pos">
              {items.findIndex((item) => item.assignmentId === activeId) + 1} of {items.length}
            </span>
          )}
          {creative && !creative.enabled && !adjusting && (
            <div className="own-off-veil">
              <span>Not shown</span>
            </div>
          )}

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
        <CardOverlay placementId={placementId} />
      </div>

      <div className="surface-body">
        {org ? (
          <div className="org-meta">
            <div className="surface-dims">{dims}</div>
            <CardStatus placementId={placementId} />
          </div>
        ) : (
          <div className="surface-head">
            <div className="surface-label" title={label}>
              {label}
            </div>
            <div className="surface-dims">{dims}</div>
          </div>
        )}

        <div className="own-tabs">
        <div className="own-strip" role="tablist" aria-label={`Your pictures for ${label}`}>
          {items.map((item, index) => (
            <button
              key={item.assignmentId}
              type="button"
              className={`own-thumb ${item.assignmentId === activeId ? "is-current" : ""} ${item.enabled ? "is-on" : "is-off"}`}
              role="tab"
              onClick={() => choose(item.assignmentId)}
              disabled={working}
              aria-selected={item.assignmentId === activeId}
              aria-label={`Picture ${index + 1}${item.enabled ? ", in the rotation" : ", switched off"}`}
              title={`${item.name}${item.enabled ? "" : " — off"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" draggable={false} />
              {item.uploading && (
                <span className="own-uploading" aria-hidden="true">
                  <span className="spinner" />
                </span>
              )}
              <span className="own-dot" aria-hidden="true">
                {item.enabled ? <TickIcon /> : <DashIcon />}
              </span>
            </button>
          ))}
          {items.length < MAX_OWN_CREATIVES && (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={addPicture} />
              <button
                type="button"
                className="own-thumb own-add"
                onClick={() => fileRef.current?.click()}
                disabled={working}
                aria-label="Add a picture of your own"
                title={items.length === 0 ? "Add a picture of your own" : `Add a picture (${items.length} of ${MAX_OWN_CREATIVES})`}
              >
                +
              </button>
            </>
          )}
        </div>

        {creative && (
          <div className={`own-panel ${items[0]?.assignmentId === activeId ? "is-first" : ""} ${items.findIndex((item) => item.assignmentId === activeId) === MAX_OWN_CREATIVES - 1 ? "is-last" : ""}`} role="tabpanel">
            {!adjusting ? (
              <div className="own-bar">
                <button
                  type="button"
                  className="own-switch own-switch-small"
                  role="switch"
                  aria-checked={creative.enabled}
                  aria-label="Show this picture"
                  onClick={toggle}
                  disabled={working}
                >
                  <span className="own-knob" />
                </button>
                <span className={`own-bar-label${creative.enabled ? "" : " is-off"}`}>
                  {creative.enabled ? "In rotation" : "Off, not in the rotation"}
                </span>
                <span className="own-bar-gap" />
                <button
                  type="button"
                  className="own-small-button own-icon-only"
                  onClick={() => setAdjusting(true)}
                  disabled={!canAdjust}
                  aria-label="Framing"
                  title={cropEnabled ? "Drag and zoom the picture inside the frame" : "Framing needs migration 0003"}
                >
                  <CropIcon />
                </button>
                <button
                  type="button"
                  className={`own-trash ${confirmDelete ? "is-confirm" : ""}`}
                  onClick={remove}
                  onBlur={() => setConfirmDelete(false)}
                  disabled={working}
                  aria-label={confirmDelete ? "Click again to delete this picture" : "Delete this picture"}
                  title={confirmDelete ? "Click again to delete" : "Delete this picture"}
                >
                  <TrashIcon />
                  {confirmDelete && <span>Delete?</span>}
                </button>
              </div>
            ) : (
              <>
                <div className="own-bar">
                  <button
                    type="button"
                    className="own-zoom-button"
                    onClick={() => setCrop({ ...crop, zoom: clampZoom(crop.zoom / 1.15) })}
                    disabled={crop.zoom <= 1}
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    className="own-range"
                    min="1"
                    max={MAX_ZOOM}
                    step="0.01"
                    value={crop.zoom}
                    onChange={(event) => setCrop({ ...crop, zoom: Number(event.target.value) })}
                    aria-label="Zoom"
                  />
                  <button
                    type="button"
                    className="own-zoom-button"
                    onClick={() => setCrop({ ...crop, zoom: clampZoom(crop.zoom * 1.15) })}
                    disabled={crop.zoom >= MAX_ZOOM}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <span className="surface-zoom">{crop.zoom.toFixed(1)}×</span>
                </div>
                <div className="own-bar">
                  <button type="button" className="link-button" onClick={() => setCrop(DEFAULT_CROP)} disabled={!framed}>
                    Reset
                  </button>
                  <span className="own-bar-gap" />
                  <button type="button" className="own-small-button" onClick={cancelFraming} disabled={saving}>
                    Cancel
                  </button>
                  <button type="button" className="own-small-button is-solid" onClick={save} disabled={!dirty || working} aria-busy={saving}>
                    {saving ? "Saving…" : justSaved ? "Saved" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        </div>

        {note && <div className={note.tone === "error" ? "error surface-note" : "surface-warn"}>{note.text}</div>}

        {!adjusting && (
          hidden >= 5 &&
          !framed && (
            <div className="surface-warn">
              {hidden}% of the image is cut off. {cropEnabled ? "Use Framing to pick what shows, or" : "Use"} a{" "}
              {ratioLabel(aspect)} file.
            </div>
          )
        )}
        {children}
        <CardSections placementId={placementId} />
        <CardChips placementId={placementId} />
      </div>
    </div>
  );
}

/** The saved framing of every picture, by assignment id. */
function cropsOf(items) {
  return Object.fromEntries(items.map((item) => [item.assignmentId, normalizeCrop(item.crop)]));
}

/** Natural size of a picture file, read in the browser before it is uploaded. */
function measure(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file does not open as an image."));
    };
    img.src = url;
  });
}

function TickIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <path d="M6 12h12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
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
