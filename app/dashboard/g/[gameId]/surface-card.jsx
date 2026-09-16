"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignCreative } from "../../actions";
import { cropPercent, ratioLabel } from "../../../../lib/surface-math";

const SAVED_FOR_MS = 2400;

/**
 * One placement. Picking a creative shows it in the frame at once; Save writes
 * it and the frame confirms. The page refreshes in the background afterwards.
 */
export default function SurfaceCard({
  placementId,
  width,
  aspect,
  label,
  dims,
  creatives,
  savedCreativeId,
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(savedCreativeId ?? "");
  const [selected, setSelected] = useState(savedCreativeId ?? "");
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(() => new Set());
  const imgRef = useRef(null);
  const timer = useRef(null);
  const preloaded = useRef(false);

  // A background refresh may bring a newer value; take it unless the user is mid-edit.
  useEffect(() => {
    const next = savedCreativeId ?? "";
    if (next === saved || status === "saving") return;
    if (selected === saved) setSelected(next);
    setSaved(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCreativeId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const byId = (id) => creatives.find((item) => item.id === id) ?? null;
  const creative = byId(selected);
  const dirty = selected !== saved;
  const saving = status === "saving";
  const isLoaded = creative ? loaded.has(creative.id) : true;
  const crop = cropPercent(creative, aspect);

  // An image already in the browser cache can finish before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (creative && img?.complete && img.naturalWidth) markLoaded(creative.id);
  }, [creative?.id]);

  function markLoaded(id) {
    setLoaded((set) => (set.has(id) ? set : new Set(set).add(id)));
  }

  // Warm the cache once the user reaches for the list, so switching is instant.
  function preload() {
    if (preloaded.current) return;
    preloaded.current = true;
    for (const item of creatives) {
      const img = new Image();
      img.decoding = "async";
      img.src = item.url;
    }
  }

  function pick(event) {
    clearTimeout(timer.current);
    setSelected(event.target.value);
    setStatus("idle");
    setError("");
  }

  async function save() {
    if (!dirty || saving) return;
    clearTimeout(timer.current);
    setStatus("saving");
    setError("");

    let result;
    try {
      result = await assignCreative({ placementId, creativeId: selected });
    } catch {
      result = { error: "Connection lost. Try again." };
    }

    if (result?.error) {
      setStatus("error");
      setError(result.error);
      return;
    }

    setSaved(selected);
    setStatus("saved");
    timer.current = setTimeout(() => setStatus("idle"), SAVED_FOR_MS);
    router.refresh(); // figures at the top; does not block the card
  }

  let badge = null;
  if (saving) badge = { tone: "busy", text: "Saving…" };
  else if (status === "saved") badge = { tone: "done", text: "Saved" };
  else if (dirty) badge = { tone: "draft", text: "Not saved" };

  const frameClass = [
    "surface-frame",
    dirty && !saving ? "is-draft" : "",
    saving ? "is-saving" : "",
    status === "saved" ? "is-saved" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="surface" style={{ width: `${width}px` }}>
      <div className={frameClass} style={{ width: `${width}px`, aspectRatio: String(aspect) }}>
        {creative ? (
          <img
            key={creative.id}
            ref={imgRef}
            src={creative.url}
            alt={creative.name}
            decoding="async"
            className={isLoaded ? "is-loaded" : ""}
            onLoad={() => markLoaded(creative.id)}
          />
        ) : (
          <div className="surface-empty">Shows your fallback</div>
        )}

        {creative && !isLoaded && <div className="surface-loading" aria-hidden="true" />}
        {saving && <div className="surface-veil" aria-hidden="true" />}

        <div className="surface-badge-slot" role="status" aria-live="polite">
          {badge && (
            <span key={badge.text} className={`surface-badge surface-badge-${badge.tone}`}>
              {badge.tone === "done" && <Check />}
              {badge.tone === "busy" && <span className="spinner" aria-hidden="true" />}
              {badge.text}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="surface-label">{label}</div>
        <div className="surface-dims">{dims}</div>
      </div>

      <div className="surface-form">
        <select
          className="field"
          value={selected}
          onChange={pick}
          onPointerEnter={preload}
          onFocus={preload}
          disabled={saving}
          style={{ flex: 1 }}
          aria-label={`Creative for ${label}`}
        >
          <option value="">No creative</option>
          {creatives.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`button surface-save ${dirty || saving ? "" : "button-quiet"}`}
          onClick={save}
          disabled={!dirty || saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : status === "saved" ? "Saved" : "Save"}
        </button>
      </div>

      {status === "error" && <div className="error surface-note">{error}</div>}

      {crop >= 5 && (
        <div className="surface-warn">
          {crop}% of this creative is cropped to fit. A {ratioLabel(aspect)} file fits exactly.
        </div>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
