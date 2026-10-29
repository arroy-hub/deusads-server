"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../../lib/supabase-browser";
import { FORMATS, aspectClose, cropKeepingSafeZone, formatOf } from "../../../../lib/formats";
import { DEFAULT_CROP, MAX_ZOOM, clampCrop, hiddenPercent, imagePlacement, sameCrop } from "../../../../lib/surface-math";
import { sampleForShape } from "../../_cabinet/samples";
import { IcCheck, IcImage, IcPlus, IcTrash, IcUpload, IcWarn } from "../../_cabinet/icons";
import { deleteAsset, registerAsset, saveFormatCrops } from "../actions";
import { deleteCreative, renameCreative } from "../../actions";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg" };
const STATUS = { approved: ["Approved", "ov-live"], pending: ["In review", "ov-scheduled"], rejected: ["Rejected", "ov-bad"] };
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(1, z));
const short = (f) => f.label.split(" ")[0];
const isImage = (file) => Boolean(TYPES[file?.type]);

function ShapeBox({ aspect, children, size = 40 }) {
  const w = aspect >= 1 ? size : Math.round(size * aspect);
  const h = aspect >= 1 ? Math.round(size / aspect) : size;
  return <span className="rd-sbox" style={{ width: w, height: h }}>{children}</span>;
}

/** Width and height of a picture file, read in the browser. */
function measure(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}: this file does not open as an image.`)); };
    img.src = url;
  });
}

/**
 * The creative editor: frame the picture for each ad shape the way a developer frames their own (the picture moves
 * and zooms under a fixed frame), see at once which required shapes are missing, rename in place. Pictures added for
 * shapes wait here until Save. `editor` is what loadCreativeEditor returns; as a pop-up over the library it closes
 * to `backTo`, inside the new-campaign wizard it closes through `onClose`.
 */
export default function CreativeEditor({ editor, backTo = "", onClose, onSaved, initialShape = null }) {
  const { creative, assets, status, note, campaigns = 0, openAspects = [] } = editor;
  const router = useRouter();
  const dialog = useRef(null);
  const win = useRef(null);
  const drag = useRef(null);
  const multi = useRef(null);
  const single = useRef(null);
  const target = useRef(null);
  const imageAspect = creative.width && creative.height ? creative.width / creative.height : 16 / 9;
  const hasZone = creative.safe && creative.safe.x != null && creative.safe.y != null;

  // How the automatic crop frames the main picture for each standard shape, and whether it can cover that shape at all.
  const auto = useMemo(() => Object.fromEntries(FORMATS.map((f) => [f.id, cropKeepingSafeZone(imageAspect, f.aspect, hasZone ? creative.safe : undefined)])), [imageAspect, hasZone, creative.safe]);
  const standard = useMemo(() => assets.filter((a) => a.formatId && FORMATS.some((f) => f.id === a.formatId)), [assets]);

  const [name, setName] = useState(creative.name);
  const [own, setOwn] = useState(() => Object.fromEntries(standard.map((a) => [a.formatId, { id: a.id, url: a.url, pending: a.status === "pending" }])));
  const [sel, setSel] = useState(() => (FORMATS.some((f) => f.id === initialShape) ? initialShape : FORMATS.find((f) => !auto[f.id].fits && !standard.some((a) => a.formatId === f.id))?.id ?? "r16x9"));
  const [crops, setCrops] = useState(() => ({ ...(editor.formatCrops ?? {}) }));
  const [dirty, setDirty] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });

  useLayoutEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  const close = () => (onClose ? onClose() : router.push(backTo || "/dashboard/creatives"));

  const shapes = useMemo(() => FORMATS.map((f) => {
    const kind = own[f.id] ? "own" : auto[f.id].fits ? "auto" : "missing";
    return { ...f, kind, pending: Boolean(own[f.id]?.pending), hidden: hiddenPercent(imageAspect, f.aspect, 1) };
  }), [own, auto, imageAspect]);
  const missing = shapes.filter((s) => s.kind === "missing");
  const readyCount = shapes.length - missing.length;
  const current = shapes.find((s) => s.id === sel) ?? shapes[0];
  const autoCrop = auto[current.id].crop;
  const crop = clampCrop(crops[current.id] ?? autoCrop, imageAspect, current.aspect);
  const place = imagePlacement(imageAspect, current.aspect, crop);
  const framed = !sameCrop(crop, clampCrop(autoCrop, imageAspect, current.aspect));
  const hiddenNow = hiddenPercent(imageAspect, current.aspect, crop.zoom);
  const placements = openAspects.length;
  const missingIds = new Set(missing.map((m) => m.id));
  const lostPlacements = openAspects.filter((a) => missingIds.has(formatOf(a))).length;

  const setCrop = (next) => { setCrops((c) => ({ ...c, [current.id]: clampCrop(next, imageAspect, current.aspect) })); setDirty(true); };
  const onDown = (e) => {
    if (current.kind !== "auto") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = win.current.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, crop, iw: (r.width * place.width) / 100, ih: (r.height * place.height) / 100 };
    setAdjusting(true);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setCrop({ zoom: d.crop.zoom, x: d.crop.x - (e.clientX - d.sx) / d.iw, y: d.crop.y - (e.clientY - d.sy) / d.ih });
  };
  const onUp = () => { drag.current = null; setAdjusting(false); };
  const onKey = (e) => {
    if (current.kind !== "auto") return;
    const step = 0.03;
    const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (m) { e.preventDefault(); setCrop({ ...crop, x: crop.x + m[0], y: crop.y + m[1] }); }
    else if (e.key === "+" || e.key === "=") setCrop({ ...crop, zoom: clampZoom(crop.zoom * 1.1) });
    else if (e.key === "-") setCrop({ ...crop, zoom: clampZoom(crop.zoom / 1.1) });
  };

  const give = (fid, picture) => { setOwn((o) => ({ ...o, [fid]: { ...picture, pending: true } })); setDirty(true); setSel(fid); };
  const flash = (text, tone = "") => setMsg({ tone, text });
  async function stage(file, fid) {
    if (!isImage(file)) throw new Error(`${file.name}: images must be PNG or JPG.`);
    if (file.size > MAX_BYTES) throw new Error(`${file.name}: images must be under 8 MB.`);
    const dims = await measure(file);
    const format = FORMATS.find((f) => f.id === fid);
    if (!aspectClose(dims.width / dims.height, format.aspect)) throw new Error(`${file.name} is ${(dims.width / dims.height).toFixed(2)}:1; ${format.label} needs about ${format.aspect.toFixed(2)}:1 (within 15%).`);
    give(fid, { url: URL.createObjectURL(file), file, ...dims });
  }
  async function addFiles(files) {
    const free = new Set(missing.map((m) => m.id));
    const done = [];
    const failed = [];
    for (const file of [...files]) {
      try {
        if (!isImage(file)) throw new Error(`${file.name}: only PNG or JPG pictures can be added.`);
        const dims = await measure(file);
        const ratio = dims.width / dims.height;
        const best = FORMATS.filter((f) => free.has(f.id) && aspectClose(ratio, f.aspect)).sort((a, b) => Math.abs(Math.log(ratio / a.aspect)) - Math.abs(Math.log(ratio / b.aspect)))[0];
        if (!best) throw new Error(`${file.name}: no free shape matches ${ratio.toFixed(2)}:1.`);
        free.delete(best.id);
        await stage(file, best.id);
        done.push(`${file.name} → ${short(best)}`);
      } catch (problem) {
        failed.push(problem?.message || `${file.name}: could not be added.`);
      }
    }
    flash([done.length ? `Added ${done.join(", ")}.` : "", ...failed].filter(Boolean).join(" "), failed.length ? "error" : "ok");
  }
  const pickFor = (fid) => { target.current = fid; single.current?.click(); };
  async function chosenFor(file) {
    const fid = target.current;
    if (!file || !fid) return;
    try { await stage(file, fid); flash(`Added ${file.name} → ${short(FORMATS.find((f) => f.id === fid))}.`, "ok"); }
    catch (problem) { flash(problem?.message || "Could not add the picture.", "error"); }
  }
  async function sampleFor(fid) {
    const format = FORMATS.find((f) => f.id === fid);
    const sample = await sampleForShape(fid, format.aspect, short(format));
    give(fid, { url: URL.createObjectURL(sample.file), file: sample.file, width: sample.width, height: sample.height });
    flash(`Added a sample picture for ${short(format)}.`, "ok");
  }
  const removeOwn = (fid) => { setOwn((o) => { const n = { ...o }; delete n[fid]; return n; }); setDirty(true); };

  async function upload(picture, formatId) {
    const db = browserClient();
    const { data } = await db.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) throw new Error("Your session expired. Sign in again.");
    const file = picture.file;
    const path = `${userId}/${crypto.randomUUID()}.${TYPES[file.type]}`;
    const { error } = await db.storage.from("creatives").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (error) throw new Error("Upload failed. Try again.");
    const result = await registerAsset({ creativeId: creative.id, formatId, path, type: file.type, size: file.size, width: picture.width, height: picture.height });
    if (result?.error) throw new Error(result.error);
    return result.notice || "";
  }

  async function save() {
    setBusy(true);
    flash("");
    const stop = (text) => { setBusy(false); flash(text, "error"); router.refresh(); };
    const notices = []; // pictures that were made smaller on upload: the pop-up stays open so the advertiser reads it
    try {
      if (name.trim() && name.trim() !== creative.name) {
        const renamed = await renameCreative({ creativeId: creative.id, name });
        if (renamed?.error) return stop(renamed.error);
      }
      // Pictures: the ones taken away first, then the new ones (a new picture for a shape replaces the old one).
      for (const a of standard) {
        if (!own[a.formatId]) {
          const removed = await deleteAsset({ assetId: a.id });
          if (removed?.error) return stop(removed.error);
        }
      }
      for (const [formatId, picture] of Object.entries(own)) if (picture.file) { const notice = await upload(picture, formatId); if (notice) notices.push(notice); }
      if (notices.length) flash(notices.join(" "), "ok");
      // Framing: only what differs from the automatic crop, and only for shapes the main picture still covers.
      const keep = Object.fromEntries(Object.entries(crops).filter(([fid, c]) => !own[fid] && auto[fid]?.fits && !sameCrop(clampCrop(c, imageAspect, FORMATS.find((f) => f.id === fid).aspect), clampCrop(auto[fid].crop, imageAspect, FORMATS.find((f) => f.id === fid).aspect))));
      if (JSON.stringify(keep) !== JSON.stringify(editor.formatCrops ?? {})) {
        const saved = await saveFormatCrops({ creativeId: creative.id, crops: keep });
        if (saved?.error) return stop(saved.error);
      }
    } catch (problem) {
      return stop(problem?.message || "Connection lost. Try again.");
    }
    setBusy(false);
    setDirty(false);
    onSaved?.();
    router.refresh();
    if (!notices.length) dialog.current?.close();
  }

  async function removeCreative() {
    setBusy(true);
    const result = await deleteCreative({ creativeId: creative.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return flash(result.error, "error");
    onSaved?.();
    router.refresh();
    dialog.current?.close();
  }

  const [statusLabel, statusTone] = STATUS[status] ?? STATUS.pending;
  const stageStyle = { "--aspect": current.aspect };

  return (
    <dialog ref={dialog} className="modal rd-dialog rd-editor" aria-labelledby="rd-ed-title" onClose={close} onCancel={(e) => busy && e.preventDefault()}>
      <div className="modal-box rd-ed-box" tabIndex={-1} autoFocus>
        <div className="rd-ed-head">
          <input id="rd-ed-title" className="rd-dname" aria-label="Creative name" value={name} maxLength={120} disabled={busy} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          <span className={`ov-pill ${statusTone}`}>{statusLabel}</span>
          <span className="rd-ed-use">{campaigns === 0 ? "Not in use" : `In ${campaigns} ${campaigns === 1 ? "campaign" : "campaigns"}`}</span>
          <button type="button" className="modal-close" aria-label="Close" disabled={busy} onClick={() => dialog.current?.close()}>×</button>
        </div>
        {status === "rejected" && note && <p className="notice rd-ed-note">Reason: {note}. Upload a corrected creative to book it.</p>}
        <div className="rd-ed-scroll">
          {missing.length > 0 ? (
            <div className="rd-need" role="status">
              <span className="rd-need-ic"><IcWarn size={18} /></span>
              <div className="rd-need-text"><strong>{missing.length} required {missing.length === 1 ? "shape is" : "shapes are"} missing</strong><span>Without {missing.length === 1 ? "it" : "them"} this creative is not shown in {lostPlacements} of {placements} open placements. Add a picture for {missing.map((m) => short(m)).join(", ")}.</span></div>
              <div className="rd-meter" aria-label={`${readyCount} of ${shapes.length} shapes ready`}><b>{readyCount}/{shapes.length}</b><span>{shapes.map((s) => <i key={s.id} className={s.kind === "missing" ? "is-missing" : ""} />)}</span></div>
              <button type="button" className="button button-small" disabled={busy} onClick={() => multi.current?.click()}><IcUpload size={14} />Add pictures</button>
            </div>
          ) : (
            <div className="rd-need is-ok" role="status"><span className="rd-need-ic"><IcCheck size={18} /></span><div className="rd-need-text"><strong>All {shapes.length} shapes are covered</strong><span>This creative can be shown in all {placements} open placements.</span></div><div className="rd-meter"><b>{shapes.length}/{shapes.length}</b><span>{shapes.map((s) => <i key={s.id} />)}</span></div></div>
          )}

          <div className="rd-ed-grid">
            <div className="rd-ed-left">
              <div className="rd-chips" role="tablist" aria-label="Shape">
                {shapes.map((s) => (
                  <button key={s.id} type="button" role="tab" aria-selected={sel === s.id} className={`rd-shape-chip is-${s.kind}`} title={s.kind === "own" ? (s.pending ? "Own picture, in review" : "Own picture") : s.kind === "auto" ? "Main image framed" : "No picture yet"} onClick={() => setSel(s.id)}>
                    <i />{short(s)}
                  </button>
                ))}
              </div>
              <p className="rd-chip-legend" aria-hidden="true"><span className="is-auto"><i />Main image framed</span><span className="is-own"><i />Own picture</span><span className="is-missing"><i />No picture yet</span></p>
              <div className={`rd-stage${over ? " is-over" : ""}`}
                onDragOver={(e) => { if (current.kind === "missing" || current.kind === "own") { e.preventDefault(); setOver(true); } }}
                onDragLeave={() => setOver(false)}
                onDrop={async (e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) { try { await stage(f, current.id); } catch (problem) { flash(problem?.message || "Could not add the picture.", "error"); } } }}>
                <div ref={win} className={`rd-window kind-${current.kind}${adjusting ? " is-adjusting" : ""}`} style={stageStyle} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey} tabIndex={current.kind === "auto" ? 0 : -1} aria-label={current.kind === "auto" ? "Framing: drag to move, scroll or use + and − to zoom" : undefined}>
                  {current.kind === "auto" && adjusting && <img className="rd-ghost-img" src={creative.url} alt="" draggable={false} style={{ width: `${place.width}%`, height: `${place.height}%`, left: `${place.left}%`, top: `${place.top}%` }} />}
                  <div className="rd-frame">
                    {current.kind === "own" && <img src={own[current.id].url} alt="" draggable={false} className="rd-fill" />}
                    {current.kind === "auto" && <img src={creative.url} alt="" draggable={false} style={{ width: `${place.width}%`, height: `${place.height}%`, left: `${place.left}%`, top: `${place.top}%` }} />}
                    {current.kind === "missing" && (
                      <div className="rd-miss">
                        <img src={creative.url} alt="" draggable={false} style={{ width: `${place.width}%`, height: `${place.height}%`, left: `${place.left}%`, top: `${place.top}%` }} />
                        <div className="rd-miss-veil"><IcImage size={22} /><b>No {short(current)} picture</b><span>The main image would hide {current.hidden}% here</span></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {current.kind === "auto" && (
                <div className="rd-zoom">
                  <button type="button" className="own-zoom-button" onClick={() => setCrop({ ...crop, zoom: clampZoom(crop.zoom / 1.15) })} disabled={crop.zoom <= 1} aria-label="Zoom out">−</button>
                  <input type="range" className="own-range" min="1" max={MAX_ZOOM} step="0.01" value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} aria-label="Zoom the picture" />
                  <button type="button" className="own-zoom-button" onClick={() => setCrop({ ...crop, zoom: clampZoom(crop.zoom * 1.15) })} disabled={crop.zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
                  <span className="surface-zoom">{crop.zoom.toFixed(1)}×</span>
                  <button type="button" className="link-button" disabled={!framed} onClick={() => setCrop(autoCrop)}>Reset</button>
                </div>
              )}
              {current.kind === "own" && (
                <div className="rd-zoom"><span className="rd-small">{own[current.id].pending ? "In review: it shows once approved." : "Own picture for this shape."}</span><span className="rd-spacer" /><button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => pickFor(current.id)}>Replace</button><button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => removeOwn(current.id)}>Remove</button></div>
              )}
              {current.kind === "missing" && (
                <div className="rd-zoom"><span className="rd-small">Drop a picture on the frame, or</span><span className="rd-spacer" /><button type="button" className="button button-small" disabled={busy} onClick={() => pickFor(current.id)}><IcUpload size={14} />Add {short(current)} picture</button><button type="button" className="link-button" disabled={busy} onClick={() => sampleFor(current.id)}>Use a sample</button></div>
              )}
              <p className="rd-small">{creative.width && creative.height ? `Main image ${creative.width} × ${creative.height} px. ` : ""}{current.kind === "auto" ? `Drag the picture inside the frame to choose what stays visible; ${hiddenNow}% of it is cropped for ${short(current)}.` : current.kind === "own" ? "This shape uses its own picture, so the main image is not cropped for it." : "A dedicated picture shows exactly as you made it."}</p>
            </div>

            <div className="rd-ed-right">
              <div className="rd-shapes-head"><strong>Shapes</strong><span className="rd-small">{readyCount} of {shapes.length} ready{placements > 0 ? ` · shown in ${placements - lostPlacements} of ${placements} open placements` : ""}</span></div>
              <ul className="rd-shapes">
                {shapes.map((s) => (
                  <li key={s.id} className={`rd-shape is-${s.kind}${sel === s.id ? " is-sel" : ""}`}>
                    <button type="button" className="rd-shape-main" onClick={() => setSel(s.id)} aria-pressed={sel === s.id}>
                      <ShapeBox aspect={s.aspect}>{s.kind === "own" ? <img src={own[s.id].url} alt="" /> : s.kind === "auto" ? <img src={creative.url} alt="" /> : <b>+</b>}</ShapeBox>
                      <span className="rd-shape-t"><b>{s.label}</b><small>{s.kind === "own" ? (s.pending ? "Own picture · in review" : "Own picture") : s.kind === "auto" ? `Main image framed${crops[s.id] && !sameCrop(clampCrop(crops[s.id], imageAspect, s.aspect), clampCrop(auto[s.id].crop, imageAspect, s.aspect)) ? " by you" : ""}` : `Required · main image would hide ${s.hidden}%`}</small></span>
                    </button>
                    {s.kind === "missing" ? <button type="button" className="rd-shape-act" disabled={busy} onClick={() => pickFor(s.id)}><IcPlus size={14} />Add</button> : <span className="rd-shape-ok"><IcCheck size={15} /></span>}
                  </li>
                ))}
              </ul>
              <div className={`rd-dropzone${over ? " is-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
                <IcUpload size={16} /><span><b>Drop several pictures</b> · each goes to the closest free shape</span>
                <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => multi.current?.click()}>Choose files</button>
              </div>
              {msg.text && <p className={`${msg.tone === "error" ? "error" : "upload-done"} rd-msg`} role="status">{msg.text}</p>}
              <input ref={multi} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = ""; }} />
              <input ref={single} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { chosenFor(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </div>
        </div>

        <div className="cd-foot rd-ed-foot">
          {confirmDelete ? (
            <span className="cd-confirm"><span>Delete this creative and its pictures? Campaigns using it lose it.</span><button type="button" className="button button-danger button-small" disabled={busy} onClick={removeCreative}>Delete</button><button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep</button></span>
          ) : (
            <button type="button" className="link-button cd-delete" disabled={busy} onClick={() => setConfirmDelete(true)}><IcTrash size={14} /> Delete</button>
          )}
          <span className="row">
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" className="button" disabled={busy || !dirty || !name.trim()} aria-busy={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </span>
        </div>
      </div>
    </dialog>
  );
}
