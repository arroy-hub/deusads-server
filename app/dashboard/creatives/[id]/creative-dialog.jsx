"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../../lib/supabase-browser";
import { FORMATS, aspectClose, coverageByFormat, normalizeSafeZone } from "../../../../lib/formats";
import { ratioLabel } from "../../../../lib/surface-math";
import { deleteAsset, registerAsset, saveSafeZone } from "../actions";
import { deleteCreative, renameCreative } from "../../actions";
import { saveTargeting } from "../actions";
import Audience from "./audience";
import { hasTargeting, targetingSummary } from "../../../../lib/targeting";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg" };
const STATUS = { approved: ["Approved", "ov-live"], pending: ["In review", "ov-scheduled"], rejected: ["Rejected", "ov-bad"] };

/**
 * The creative editor as a pop-up over the Creatives tab: rename, frame what must stay visible, one tile per
 * standard shape (add, replace or remove its picture; or drop several pictures and they are matched to the shapes
 * by proportions), and a single Save for the name and the frame. Closing returns to the list.
 */
export default function CreativeDialog({ creative, assets, status, note, placements, missingPlacements, audience, audienceMissing, backTo = "" }) {
  const router = useRouter();
  const dialog = useRef(null);
  const stage = useRef(null);
  const drag = useRef(null);
  const fileInput = useRef(null);
  const tileInput = useRef(null);
  const tileFormat = useRef(null);

  const aspect = creative.width && creative.height ? creative.width / creative.height : 16 / 9;
  const initial = normalizeSafeZone(creative.safe);
  const [name, setName] = useState(creative.name);
  const [size, setSize] = useState(Math.min(initial.w, initial.h));
  const [centre, setCentre] = useState({ x: initial.x + initial.w / 2, y: initial.y + initial.h / 2 });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState("picture"); // picture | audience
  const [aud, setAud] = useState({ targeting: audience?.targeting ?? null, changed: false });

  useLayoutEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  useEffect(() => {
    setName(creative.name);
  }, [creative.name]);

  const close = () => router.push(backTo || "/dashboard/creatives");
  const zone = normalizeSafeZone({ x: centre.x - size / 2, y: centre.y - size / 2, w: size, h: size });
  const matrix = coverageByFormat({
    creative: { aspect, safeZone: zone },
    assets: assets.map((asset) => ({ formatId: asset.formatId, aspect: asset.aspect, status: asset.status })),
  });
  const missing = matrix.filter((row) => row.kind === "none").map((row) => row.format);

  function clampCentre(next, s) {
    const half = s / 2;
    return { x: Math.min(1 - half, Math.max(half, next.x)), y: Math.min(1 - half, Math.max(half, next.y)) };
  }
  const startDrag = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, centre };
  };
  const moveDrag = (event) => {
    if (!drag.current || !stage.current) return;
    const box = stage.current.getBoundingClientRect();
    setCentre(clampCentre({ x: drag.current.centre.x + (event.clientX - drag.current.x) / box.width, y: drag.current.centre.y + (event.clientY - drag.current.y) / box.height }, size));
    setDirty(true);
  };
  const endDrag = () => {
    drag.current = null;
  };
  const zoom = (value) => {
    const next = Math.min(1, Math.max(0.1, Number(value)));
    setSize(next);
    setCentre((current) => clampCentre(current, next));
    setDirty(true);
  };

  async function save() {
    setBusy(true);
    setMessage({ tone: "", text: "" });
    if (name.trim() && name.trim() !== creative.name) {
      const renamed = await renameCreative({ creativeId: creative.id, name }).catch(() => ({ error: "Connection lost. Try again." }));
      if (renamed?.error) {
        setBusy(false);
        return setMessage({ tone: "error", text: renamed.error });
      }
    }
    if (aud.changed) {
      const aimed = await saveTargeting({ creativeId: creative.id, targeting: aud.targeting }).catch(() => ({ error: "Connection lost. Try again." }));
      if (aimed?.error) {
        setBusy(false);
        setTab("audience");
        return setMessage({ tone: "error", text: aimed.error });
      }
    }
    const result = dirty ? await saveSafeZone({ creativeId: creative.id, ...zone }).catch(() => ({ error: "Connection lost. Try again." })) : { ok: true };
    setBusy(false);
    if (result?.error) return setMessage({ tone: "error", text: result.error });
    setDirty(false);
    close();
  }

  async function uploadOne(file, formatId) {
    if (!TYPES[file.type]) throw new Error(`${file.name}: images must be PNG or JPG.`);
    if (file.size > MAX_BYTES) throw new Error(`${file.name}: images must be under 8 MB.`);
    const dims = await measure(file);
    const format = FORMATS.find((item) => item.id === formatId);
    if (format && !aspectClose(dims.width / dims.height, format.aspect)) {
      throw new Error(`${file.name} is ${(dims.width / dims.height).toFixed(2)}:1; ${format.label} needs about ${format.aspect.toFixed(2)}:1 (within 15%).`);
    }
    const db = browserClient();
    const { data } = await db.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) throw new Error("Your session expired. Sign in again.");
    const path = `${userId}/${crypto.randomUUID()}.${TYPES[file.type]}`;
    const { error } = await db.storage.from("creatives").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (error) throw new Error("Upload failed. Try again.");
    const result = await registerAsset({ creativeId: creative.id, formatId, path, type: file.type, size: file.size, width: dims.width, height: dims.height });
    if (result?.error) throw new Error(result.error);
    return result;
  }

  /** Pictures dropped or chosen: each goes to the free standard shape closest to its proportions. */
  async function addFiles(files) {
    const list = [...files];
    if (list.length === 0) return;
    setBusy(true);
    setMessage({ tone: "", text: "" });
    const taken = new Set(assets.map((asset) => asset.formatId));
    const done = [];
    const failed = [];
    for (const file of list) {
      try {
        const dims = await measure(file);
        const ratio = dims.width / dims.height;
        const target = FORMATS.filter((format) => !taken.has(format.id) && aspectClose(ratio, format.aspect)).sort((a, b) => Math.abs(Math.log(ratio / a.aspect)) - Math.abs(Math.log(ratio / b.aspect)))[0];
        if (!target) throw new Error(`${file.name}: no free shape matches ${ratio.toFixed(2)}:1.`);
        await uploadOne(file, target.id);
        taken.add(target.id);
        done.push(`${file.name} → ${target.label.split(" ")[0]}`);
      } catch (error) {
        failed.push(error?.message || `${file.name}: could not be added.`);
      }
    }
    setBusy(false);
    setMessage({ tone: failed.length ? "error" : "ok", text: [done.length ? `Added: ${done.join(", ")}.` : "", ...failed].filter(Boolean).join(" ") });
    router.refresh();
  }

  async function replaceTile(file) {
    const formatId = tileFormat.current;
    if (!file || !formatId) return;
    setBusy(true);
    setMessage({ tone: "", text: "" });
    try {
      const result = await uploadOne(file, formatId);
      setMessage({ tone: "ok", text: result.status === "pending" ? "Added. It will be shown once it is reviewed." : "Added." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error?.message || "Connection lost. Try again." });
    }
    setBusy(false);
  }

  async function removeAsset(assetId) {
    setBusy(true);
    const result = await deleteAsset({ assetId }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setMessage({ tone: "error", text: result.error });
    router.refresh();
  }

  async function removeCreative() {
    setBusy(true);
    const result = await deleteCreative({ creativeId: creative.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setMessage({ tone: "error", text: result.error });
    close();
  }

  const [statusLabel, statusTone] = STATUS[status] ?? STATUS.pending;

  return (
    <dialog ref={dialog} className="modal cd-dialog" aria-labelledby="cd-title" onClose={close} onCancel={(event) => busy && event.preventDefault()}>
      <div className="cd-box">
        <div className="cd-head">
          <input id="cd-title" className="cd-name" aria-label="Creative name" value={name} maxLength={120} disabled={busy} onChange={(event) => { setName(event.target.value); setDirty(true); }} />
          <span className={`ov-pill ${statusTone}`}>{statusLabel}</span>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => dialog.current?.close()} disabled={busy}>
            ×
          </button>
        </div>
        {status === "rejected" && note && <p className="notice cd-note">Reason: {note}. Upload a corrected creative to book it.</p>}

        <div className="cd-tabs" role="tablist" aria-label="Creative sections">
          <button type="button" role="tab" aria-selected={tab === "picture"} className="cd-tab" onClick={() => setTab("picture")}>
            Picture and shapes
          </button>
          {audience && (
            <button type="button" role="tab" aria-selected={tab === "audience"} className="cd-tab" onClick={() => setTab("audience")}>
              Audience
              <span className="tab-count">{hasTargeting(aud.targeting) ? targetingSummary(aud.targeting) : "Every game"}</span>
              {aud.changed && <span className="cd-unsaved" aria-label="Not saved yet">●</span>}
            </button>
          )}
        </div>

        {tab === "audience" && audience && (
          <div className="cd-body">
            <div className="cd-audience">
              <Audience creativeId={creative.id} initial={audience.targeting} catalog={audience.catalog} embedded onChange={setAud} />
            </div>
          </div>
        )}
        {audienceMissing && (
          <p className="notice cd-note">
            Run <code>supabase/migrations/0018_targeting.sql</code> in the Supabase SQL editor to choose which games may show this creative.
          </p>
        )}

        <div className="cd-body" hidden={tab !== "picture"}>
          <div className="cd-left">
            <div ref={stage} className="safe-stage" style={{ aspectRatio: String(aspect) }} role="img" aria-label="Main image with a frame around the part that must stay visible">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creative.url} alt="" draggable={false} />
              <div
                className="safe-frame"
                role="slider"
                aria-label="Keep visible: move the frame"
                aria-valuemin={10}
                aria-valuemax={100}
                aria-valuenow={Math.round(size * 100)}
                tabIndex={0}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => {
                  const step = 0.02;
                  const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
                  if (!move) return;
                  event.preventDefault();
                  setCentre((current) => clampCentre({ x: current.x + move[0], y: current.y + move[1] }, size));
                  setDirty(true);
                }}
                style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.w * 100}%`, height: `${zone.h * 100}%` }}
              />
            </div>
            <label className="cd-slider">
              <span>Keep visible</span>
              <input type="range" min="10" max="100" value={Math.round(size * 100)} onChange={(event) => zoom(Number(event.target.value) / 100)} disabled={busy} />
              <span className="num">{Math.round(size * 100)}%</span>
            </label>
            <p className="cd-small">
              {creative.width && creative.height ? `${creative.width} × ${creative.height} px (${ratioLabel(aspect)}). ` : ""}Drag the frame over the logo, face or text that must never be cut off.
            </p>
          </div>

          <div className="cd-right">
            <div className="cd-shapes-head">
              <strong>Shapes</strong>
              {placements > 0 && <span className="cd-small">Shown in {placements - missingPlacements} of {placements} open placements</span>}
            </div>
            <div className="cd-shapes">
              {matrix.map((row) => {
                const asset = assets.find((item) => item.formatId === row.format.id);
                const ratio = row.format.label.split(" ")[0];
                const state = row.kind === "none" ? "add" : row.pending ? "wait" : "ok";
                const [w, h] = ratio.split(":").map(Number);
                const box = w >= h ? { width: 44, height: Math.round((44 * h) / w) } : { height: 44, width: Math.round((44 * w) / h) };
                return (
                  <div key={row.format.id} className={`cd-shape is-${state}`}>
                    <button
                      type="button"
                      className="cd-shape-pick"
                      disabled={busy}
                      aria-label={asset ? `Replace the ${ratio} picture` : row.kind === "none" ? `Add a ${ratio} picture` : `Add a dedicated ${ratio} picture`}
                      onClick={() => {
                        tileFormat.current = row.format.id;
                        tileInput.current?.click();
                      }}
                    >
                      <span className="cd-frame">
                        {asset ? <img src={asset.url} alt="" style={box} /> : <span className={row.kind === "none" ? "cd-empty" : "cd-auto"} style={box}>{row.kind === "none" ? "+" : ""}</span>}
                      </span>
                      <span className="num">{ratio}</span>
                      <span className="cd-state">{state === "add" ? "add" : state === "wait" ? "in review" : asset ? "own ✓" : "auto-crop ✓"}</span>
                    </button>
                    {asset && (
                      <button type="button" className="cd-remove" disabled={busy} onClick={() => removeAsset(asset.id)} aria-label={`Remove the ${ratio} picture`}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <input ref={tileInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { replaceTile(event.target.files?.[0]); event.target.value = ""; }} />

            <div
              className={`cd-drop ${over ? "is-over" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(event) => { event.preventDefault(); setOver(false); addFiles(event.dataTransfer.files); }}
            >
              <span>
                <b>Drop your pictures here</b> <span className="cd-small">· one or several. Each goes to the shape closest to its proportions.{missing.length > 0 ? ` Missing: ${missing.map((format) => format.label.split(" ")[0]).join(", ")}.` : ""}</span>
              </span>
              <button type="button" className="button button-small" disabled={busy} onClick={() => fileInput.current?.click()}>
                Choose files
              </button>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(event) => { addFiles(event.target.files ?? []); event.target.value = ""; }} />
            </div>
            <p className="cd-small">Where no picture fits, the main image is cropped around the frame; where that would cut the frame, the creative is simply not shown there and your booking stays.</p>
          </div>
        </div>

        {message.text && (
          <p className={message.tone === "error" ? "error cd-msg" : "upload-done cd-msg"} role="status" aria-live="polite">
            {message.text}
          </p>
        )}

        <div className="cd-foot">
          {confirmDelete ? (
            <span className="cd-confirm">
              <span>Delete this creative and its pictures? Campaigns using it lose it.</span>
              <button type="button" className="button button-danger" disabled={busy} onClick={removeCreative}>
                Delete
              </button>
              <button type="button" className="button button-quiet" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="link-button cd-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          <span className="row">
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button type="button" className="button" disabled={busy || !(dirty || aud.changed) || !name.trim()} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      </div>
    </dialog>
  );
}

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
      reject(new Error(`${file.name}: this file does not open as an image.`));
    };
    img.src = url;
  });
}
