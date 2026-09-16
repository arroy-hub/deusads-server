"use client";

import { useEffect, useRef, useState } from "react";
import { registerCreative } from "../actions";
import { browserClient } from "../../../lib/supabase-browser";
import { ratioLabel } from "../../../lib/surface-math";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * The file goes from the browser straight to Supabase Storage (same session,
 * same storage policies), then a small action records it. The preview and the
 * size check happen the moment a file is chosen.
 */
export default function UploadForm() {
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { url, width, height }
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [message, setMessage] = useState("");

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  function choose(event) {
    const next = event.target.files?.[0] ?? null;
    setStatus("idle");
    setMessage("");
    setPreview(null);
    setFile(null);
    if (!next) return;

    if (!TYPES[next.type]) return fail("Creatives must be PNG or JPG.");
    if (next.size > MAX_BYTES) return fail("Creatives must be under 8 MB.");

    const url = URL.createObjectURL(next);
    const img = new Image();
    img.onload = () => setPreview({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fail("This file does not open as an image.");
    };
    img.src = url;
    setFile(next);
  }

  function fail(text) {
    setStatus("error");
    setMessage(text);
  }

  async function submit(event) {
    event.preventDefault();
    if (!file || !preview || status === "uploading") return;
    setStatus("uploading");
    setMessage("");

    try {
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) return fail("Your session expired. Sign in again.");

      const path = `${userId}/${crypto.randomUUID()}.${TYPES[file.type]}`;
      const { error: uploadError } = await db.storage
        .from("creatives")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (uploadError) return fail("Upload failed. Try again.");

      const result = await registerCreative({
        name: name || file.name.replace(/\.[^.]+$/, ""),
        path,
        type: file.type,
        size: file.size,
        width: preview.width,
        height: preview.height,
      });
      if (result?.error) return fail(result.error);

      setStatus("done");
      setMessage(`“${result.creative.name}” is in the library. Pick it on any placement.`);
      setFile(null);
      setPreview(null);
      setName("");
      formRef.current?.reset();
    } catch {
      fail("Connection lost. Try again.");
    }
  }

  const uploading = status === "uploading";

  return (
    <form ref={formRef} onSubmit={submit} className="panel stack upload" style={{ maxWidth: 480 }}>
      <label>
        Name
        <input
          className="field"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "Nike — arena 16:9"}
          disabled={uploading}
        />
      </label>

      <label>
        Image
        <input
          ref={inputRef}
          className="field"
          type="file"
          accept="image/png,image/jpeg"
          onChange={choose}
          disabled={uploading}
          required
        />
      </label>

      {preview && (
        <div className={`upload-preview ${uploading ? "is-uploading" : ""}`}>
          <img src={preview.url} alt="" />
          <div className="upload-meta">
            {preview.width} × {preview.height} px · {ratioLabel(preview.width / preview.height)} ·{" "}
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </div>
          {uploading && <div className="upload-bar" aria-hidden="true" />}
        </div>
      )}

      <div className="upload-actions">
        <button className="button" type="submit" disabled={!preview || uploading} aria-busy={uploading}>
          {uploading ? "Uploading…" : "Upload creative"}
        </button>
        <span role="status" aria-live="polite" className={status === "error" ? "error" : "upload-done"}>
          {status === "done" && <Check />}
          {message}
        </span>
      </div>
    </form>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
