"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setGameIcon } from "./actions";
import { browserClient } from "../../lib/supabase-browser";

const SIZE = 256;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * A game's icon with a button to change it. The picture is cut to a centred square and scaled down
 * to 256 px right in the browser, so what is uploaded is small whatever the original was, then it
 * goes straight to Storage like creatives do. Without an icon the first letter of the name shows.
 * `editable` false (an older database without migration 0019) shows the icon but no button.
 */
export default function GameIcon({ gameId, name, url, editable = true }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Choose a picture (PNG, JPG or WebP).");
    if (file.size > MAX_INPUT_BYTES) return setError("The picture is over 10 MB.");

    setBusy(true);
    try {
      const blob = await square(file);
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) return setError("Your session expired. Sign in again.");

      const path = `${userId}/game-icon-${gameId}-${Date.now()}.png`;
      const { error: uploadError } = await db.storage
        .from("creatives")
        .upload(path, blob, { contentType: "image/png", cacheControl: "31536000", upsert: false });
      if (uploadError) return setError("Upload failed. Try again.");

      const result = await setGameIcon({ gameId, path }).catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) return setError(result.error);
      router.refresh();
    } catch {
      setError("Could not read that picture.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await setGameIcon({ gameId, path: null }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="game-icon-box">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="game-icon" src={url} alt="" width="56" height="56" />
      ) : (
        <span className="game-icon is-empty" aria-hidden="true">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      {editable && (
        <div className="game-icon-actions">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choose} />
          <button type="button" className="link-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Saving…" : url ? "Change icon" : "Add icon"}
          </button>
          {url && !busy && (
            <button type="button" className="link-button" onClick={remove}>
              Remove
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="error game-icon-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** The middle square of the picture, scaled to SIZE × SIZE, as a PNG. */
async function square(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("no picture");
  return blob;
}
