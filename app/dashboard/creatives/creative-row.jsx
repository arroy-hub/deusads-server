"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteCreative, renameCreative } from "../actions";

/**
 * One creative in the library: thumbnail, name (renamable), size, status and how
 * many placements show it. Deleting asks first and says what will happen.
 */
export default function CreativeRow({ id, name, url, size, status, note, usedBy, category, audience = "", canAim = false }) {
  const router = useRouter();
  const [mode, setMode] = useState("view"); // view | rename | delete
  const [title, setTitle] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (title.trim() === name) return setMode("view");
    setBusy(true);
    setError("");
    const result = await renameCreative({ creativeId: id, name: title }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setMode("view");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError("");
    const result = await deleteCreative({ creativeId: id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <tr>
      <td className="thumb-cell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="thumb" src={url} alt="" loading="lazy" width="64" height="40" />
      </td>
      <td>
        {mode === "rename" ? (
          <form onSubmit={save} className="row">
            <input
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              aria-label="Creative name"
              autoFocus
              disabled={busy}
              required
            />
            <button className="button" type="submit" disabled={busy || !title.trim()}>
              Save
            </button>
            <button
              className="button button-quiet"
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("view");
                setTitle(name);
                setError("");
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <span className="creative-name">{name}</span>
        )}
        {category && <div className="muted-line">{category}</div>}
        {canAim && <div className="muted-line">{audience ? `Audience: ${audience}` : "Audience: every game"}</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </td>
      <td>{size}</td>
      <td>
        {status}
        {status === "rejected" && note && <div className="muted-line">{note}</div>}
        {status === "pending" && <div className="muted-line">Waiting for review</div>}
      </td>
      <td>{usedBy > 0 ? `${usedBy} ${usedBy === 1 ? "placement" : "placements"}` : "Not in use"}</td>
      <td className="actions-cell">
        {mode === "delete" ? (
          <div className="confirm-inline">
            <span className="confirm-text">
              {usedBy > 0
                ? `${usedBy === 1 ? "The placement" : `${usedBy} placements`} will go back to the fallback texture.`
                : "Delete this creative?"}
            </span>
            <button className="button button-danger" type="button" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button className="button button-quiet" type="button" onClick={() => setMode("view")} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          mode === "view" && (
            <div className="row-actions">
              <Link className="link-button" href={`/dashboard/creatives/${id}`}>
                {canAim ? "Formats and audience" : "Formats"}
              </Link>
              <button className="link-button" type="button" onClick={() => setMode("rename")}>
                Rename
              </button>
              <button className="link-button" type="button" onClick={() => setMode("delete")}>
                Delete
              </button>
            </div>
          )
        )}
      </td>
    </tr>
  );
}
