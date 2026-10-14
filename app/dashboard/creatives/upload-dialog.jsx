"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { registerCreative } from "../actions";
import { browserClient } from "../../../lib/supabase-browser";
import { AD_CATEGORIES } from "../../../lib/categories";
import { IcUpload } from "../_cabinet/icons";
import { SAMPLES, drawSample } from "../_cabinet/samples";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * The "add a creative" pop-up: pick or drop a picture, name it, say what it advertises, add it. The file goes from the
 * browser straight to Storage, then a small action records it (like the old upload form). Used by the library, by a
 * campaign's Creatives tab and by the new-campaign wizard.
 */
export default function UploadDialog({ title = "Add a creative", lede = "A PNG or JPG under 8 MB. You can add the other ad shapes after.", submit = "Add creative", folders = null, folderId = "", onClose, onUploaded }) {
  const ref = useRef(null);
  const input = useRef(null);
  const [pic, setPic] = useState(null); // { url, w, h, file }
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [folder, setFolder] = useState(folderId);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [samples, setSamples] = useState(null);
  useLayoutEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  useEffect(() => () => { if (pic?.url) URL.revokeObjectURL(pic.url); }, [pic]);
  useEffect(() => () => { for (const sample of samples ?? []) URL.revokeObjectURL(sample.url); }, [samples]);

  async function openSamples() {
    const next = !samplesOpen;
    setSamplesOpen(next);
    if (next && !samples) {
      const made = await Promise.all(SAMPLES.map(async (sample) => {
        const blob = await drawSample(sample);
        return { ...sample, blob, url: URL.createObjectURL(blob) };
      }));
      setSamples(made);
    }
  }

  function take(file, fallbackName) {
    setError("");
    if (!file) return;
    if (!TYPES[file.type]) return setError("Images must be PNG or JPG.");
    if (file.size > MAX_BYTES) return setError("Images must be under 8 MB.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPic({ url, w: img.naturalWidth, h: img.naturalHeight, file });
      setName((n) => n || fallbackName || file.name.replace(/\.[^.]+$/, ""));
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError("This file does not open as an image."); };
    img.src = url;
  }
  const sample = (s) => take(new File([s.blob], `${s.id}.png`, { type: "image/png" }), s.label);
  const ratio = pic ? (pic.w / pic.h).toFixed(2) : null;

  async function add() {
    if (!pic || !name.trim() || !category || busy) return;
    setBusy(true);
    setError("");
    try {
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) throw new Error("Your session expired. Sign in again.");
      const path = `${userId}/${crypto.randomUUID()}.${TYPES[pic.file.type]}`;
      const { error: uploadError } = await db.storage.from("creatives").upload(path, pic.file, { contentType: pic.file.type, cacheControl: "31536000", upsert: false });
      if (uploadError) throw new Error("Upload failed. Try again.");
      const result = await registerCreative({ name: name.trim(), path, type: pic.file.type, size: pic.file.size, width: pic.w, height: pic.h, adCategory: category });
      if (result?.error) throw new Error(result.error);
      // The stored picture's own address: the local preview address stops working once this pop-up closes.
      const stored = db.storage.from("creatives").getPublicUrl(path).data.publicUrl;
      await onUploaded?.({ ...result.creative, url: stored || pic.url, width: pic.w, height: pic.h }, { folderId: folder || null });
      ref.current?.close();
    } catch (problem) {
      setError(problem?.message || "Connection lost. Try again.");
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="modal rd-dialog" aria-labelledby="rd-up-title" onClose={onClose}>
      <div className="modal-box">
        <div className="rd-dhead"><div><h2 id="rd-up-title">{title}</h2><p className="rd-dsub">{lede}</p></div><button type="button" className="modal-close" aria-label="Close" onClick={() => ref.current?.close()}>×</button></div>
        <div className="rd-dbody">
          {!pic ? (
            <div className="rd-up-pick">
              <div className={`rd-drop is-compact${over ? " is-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}>
                <span className="rd-drop-ic"><IcUpload size={18} /></span>
                <span className="rd-drop-text"><b>Drop a picture here</b><span className="rd-dsub">PNG or JPG</span></span>
                <button type="button" className="button button-small" onClick={() => input.current?.click()}>Choose a file</button>
                <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className={`rd-samples-box${samplesOpen ? " is-open" : ""}`}>
                <button type="button" className="rd-samples-head" aria-expanded={samplesOpen} onClick={openSamples}><b>No file at hand?</b><span className="rd-dsub">Try one of the samples</span><span className="rd-samples-caret" aria-hidden="true">›</span></button>
                {samplesOpen && <div className="rd-samples">{(samples ?? SAMPLES.map((s) => ({ ...s, url: "" }))).map((s) => <button key={s.id} type="button" className="rd-sample" disabled={!samples} onClick={() => sample(s)}>{s.url ? <img src={s.url} alt="" /> : <span className="rd-sample-wait" />}<span>{s.label}</span></button>)}</div>}
              </div>
            </div>
          ) : (
            <div className="rd-up">
              <div className="rd-up-pic"><img src={pic.url} alt="" /><span className="rd-up-meta">{pic.w} × {pic.h} px · {ratio}:1</span><button type="button" className="link-button" disabled={busy} onClick={() => setPic(null)}>Choose another</button></div>
              <div className="rd-up-form">
                <label className="rd-lab">Name<input className="field" value={name} maxLength={120} disabled={busy} onChange={(e) => setName(e.target.value)} autoFocus /></label>
                <label className="rd-lab">What is advertised
                  <select className="field" value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}>
                    <option value="" disabled>Choose a category</option>
                    {AD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                {folders && folders.length > 0 && (
                  <label className="rd-lab">Folder<select className="field" value={folder} disabled={busy} onChange={(e) => setFolder(e.target.value)}><option value="">Not in a folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
                )}
                <p className="rd-dsub">The picture is checked after upload. Ads start once it is approved.</p>
              </div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="rd-dfoot">
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => ref.current?.close()}>Cancel</button>
          <button type="button" className="button" disabled={!pic || !name.trim() || !category || busy} aria-busy={busy} onClick={add}>{busy ? "Uploading…" : submit}</button>
        </div>
      </div>
    </dialog>
  );
}
