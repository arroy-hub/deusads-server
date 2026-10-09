"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../../lib/supabase-browser";
import { FORMATS, aspectClose, coverageByFormat, coverageWord, formatLabel, normalizeSafeZone } from "../../../../lib/formats";
import { ratioLabel } from "../../../../lib/surface-math";
import { deleteAsset, registerAsset, saveSafeZone } from "../actions";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg" };

const WORD = { "own image": "Own image", "auto-crop": "Auto-crop", "not covered": "Not covered" };

/** Safe zone frame + the format matrix + uploads for one creative. */
export default function Workbench({ creative, assets }) {
  const router = useRouter();
  const aspect = creative.width && creative.height ? creative.width / creative.height : 16 / 9;

  // The frame keeps the image's own proportions: one size (a share of the image) and a centre.
  const initial = normalizeSafeZone(creative.safe);
  const [size, setSize] = useState(Math.min(initial.w, initial.h));
  const [centre, setCentre] = useState({ x: initial.x + initial.w / 2, y: initial.y + initial.h / 2 });
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ tone: "", text: "" });
  const stage = useRef(null);
  const drag = useRef(null);

  const zone = normalizeSafeZone({
    x: centre.x - size / 2,
    y: centre.y - size / 2,
    w: size,
    h: size,
  });

  const matrix = coverageByFormat({
    creative: { aspect, safeZone: zone },
    assets: assets.map((asset) => ({ formatId: asset.formatId, aspect: asset.aspect, status: asset.status })),
  });

  function clampCentre(next, s) {
    const half = s / 2;
    return {
      x: Math.min(1 - half, Math.max(half, next.x)),
      y: Math.min(1 - half, Math.max(half, next.y)),
    };
  }

  function startDrag(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, centre };
  }
  function moveDrag(event) {
    if (!drag.current || !stage.current) return;
    const box = stage.current.getBoundingClientRect();
    const dx = (event.clientX - drag.current.x) / box.width;
    const dy = (event.clientY - drag.current.y) / box.height;
    setCentre(clampCentre({ x: drag.current.centre.x + dx, y: drag.current.centre.y + dy }, size));
    setSaved(false);
  }
  function endDrag() {
    drag.current = null;
  }
  function zoom(value) {
    const next = Math.min(1, Math.max(0.1, Number(value)));
    setSize(next);
    setCentre((current) => clampCentre(current, next));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setMessage({ tone: "", text: "" });
    const result = await saveSafeZone({ creativeId: creative.id, ...zone }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setMessage({ tone: "error", text: result.error });
    setSaved(true);
    setMessage({ tone: "ok", text: "Saved." });
    router.refresh();
  }

  async function upload(formatId, file) {
    if (!file) return;
    setBusy(true);
    setMessage({ tone: "", text: "" });
    try {
      if (!TYPES[file.type]) throw new Error("Images must be PNG or JPG.");
      if (file.size > MAX_BYTES) throw new Error("Images must be under 8 MB.");
      const dims = await measure(file);
      const format = FORMATS.find((item) => item.id === formatId);
      if (format && !aspectClose(dims.width / dims.height, format.aspect)) {
        throw new Error(`This image is ${(dims.width / dims.height).toFixed(2)}:1; ${format.label} needs about ${format.aspect.toFixed(2)}:1 (within 15%).`);
      }
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) throw new Error("Your session expired. Sign in again.");
      const path = `${userId}/${crypto.randomUUID()}.${TYPES[file.type]}`;
      const { error: uploadError } = await db.storage
        .from("creatives")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (uploadError) throw new Error("Upload failed. Try again.");
      const result = await registerAsset({
        creativeId: creative.id,
        formatId,
        path,
        type: file.type,
        size: file.size,
        width: dims.width,
        height: dims.height,
      });
      if (result?.error) throw new Error(result.error);
      setMessage({
        tone: "ok",
        text: result.status === "pending" ? "Uploaded. It will be shown once it is reviewed." : "Uploaded.",
      });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error?.message || "Connection lost. Try again." });
    }
    setBusy(false);
  }

  async function remove(assetId) {
    setBusy(true);
    const result = await deleteAsset({ assetId }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setMessage({ tone: "error", text: result.error });
    router.refresh();
  }

  const customAssets = assets.filter((asset) => !asset.formatId);

  return (
    <div className="stack">
      <section className="panel stack">
        <h2>Safe zone</h2>
        <p className="settings-help">
          Move and resize the frame over what must never be cut off (a logo, a face, the text). When your
          image is cropped to another shape, it is shown only if the frame fits.
        </p>
        <div
          ref={stage}
          className="safe-stage"
          style={{ aspectRatio: String(aspect), maxWidth: 560 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creative.url} alt="" draggable={false} />
          <div
            className="safe-frame"
            role="slider"
            aria-label="Safe zone"
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
              setSaved(false);
            }}
            style={{
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.w * 100}%`,
              height: `${zone.h * 100}%`,
            }}
          />
        </div>
        <label>
          Frame size ({Math.round(size * 100)}% of the image)
          <input
            type="range"
            min="10"
            max="100"
            value={Math.round(size * 100)}
            onChange={(event) => zoom(Number(event.target.value) / 100)}
            disabled={busy}
          />
        </label>
        <div className="row">
          <button className="button" type="button" onClick={save} disabled={busy || saved}>
            {busy ? "Saving…" : saved ? "Saved" : "Save safe zone"}
          </button>
        </div>
      </section>

      <section className="panel stack">
        <h2>Formats</h2>
        <p className="settings-help">
          {creative.width && creative.height
            ? `Your image is ${creative.width} × ${creative.height} px (${ratioLabel(aspect)}).`
            : "The size of your image is not recorded; 16:9 is assumed."}{" "}
          Each placement shows the
          picture made for its format, else your main image cropped around the safe zone. Where neither works,
          the creative is simply not shown there; your booking stays.
        </p>
        <table>
          <thead>
            <tr>
              <th>Format</th>
              <th>Shown as</th>
              <th>Your image for it</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const asset = assets.find((item) => item.formatId === row.format.id);
              const word = coverageWord(row);
              return (
                <tr key={row.format.id}>
                  <td>{row.format.label}</td>
                  <td className={word === "not covered" ? "error" : undefined}>
                    {WORD[word]}
                    {row.pending && <div className="muted-line">New image waiting for review</div>}
                  </td>
                  <td>
                    <AssetCell
                      asset={asset}
                      busy={busy}
                      onFile={(file) => upload(row.format.id, file)}
                      onRemove={() => asset && remove(asset.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3>Custom shapes</h3>
        <p className="settings-help">
          For placements that are not a standard shape: an image within 15% of the placement&apos;s proportions is used.
        </p>
        {customAssets.map((asset) => (
          <AssetCell key={asset.id} asset={asset} busy={busy} onRemove={() => remove(asset.id)} showLabel />
        ))}
        <CustomUpload busy={busy} onFile={(file) => upload("custom", file)} />
      </section>

      {message.text && (
        <p className={message.tone === "error" ? "error" : "upload-done"} role="status" aria-live="polite">
          {message.text}
        </p>
      )}
    </div>
  );
}

function AssetCell({ asset, busy, onFile, onRemove, showLabel }) {
  if (asset) {
    return (
      <div className="row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="thumb" src={asset.url} alt="" width="64" height="40" loading="lazy" />
        <span className="muted-line">
          {showLabel ? `${formatLabel(null)} · ` : ""}
          {asset.width} × {asset.height} · {asset.status}
          {asset.status === "rejected" && asset.note ? `: ${asset.note}` : ""}
        </span>
        <button className="button button-quiet" type="button" disabled={busy} onClick={onRemove}>
          Remove
        </button>
        {onFile && (
          <label className="button button-quiet">
            Replace
            <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} />
          </label>
        )}
      </div>
    );
  }
  return (
    <label className="button button-quiet">
      Upload
      <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function CustomUpload({ busy, onFile }) {
  return (
    <label className="button button-quiet" style={{ width: "fit-content" }}>
      Add a custom-shape image
      <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
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
      reject(new Error("This file does not open as an image."));
    };
    img.src = url;
  });
}
