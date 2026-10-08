"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaign, renameCampaign } from "./actions";

/** A campaign's heading with rename and delete. Deleting asks first and says what goes with it. */
export default function CampaignHead({ id, name, bookings }) {
  const router = useRouter();
  const [mode, setMode] = useState("view"); // view | rename | delete
  const [title, setTitle] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action, done) {
    setBusy(true);
    setError("");
    const result = await action().catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    done?.();
    router.refresh();
  }

  const save = (event) => {
    event.preventDefault();
    if (busy) return;
    if (title.trim() === name) return setMode("view");
    run(() => renameCampaign({ campaignId: id, name: title }), () => setMode("view"));
  };

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      {mode === "rename" ? (
        <form onSubmit={save} className="row">
          <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} aria-label="Campaign name" autoFocus disabled={busy} required />
          <button className="button" type="submit" disabled={busy || !title.trim()}>
            Save
          </button>
          <button className="button button-quiet" type="button" disabled={busy} onClick={() => { setMode("view"); setTitle(name); setError(""); }}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="row">
          <h2 style={{ margin: 0 }}>{name}</h2>
          {mode === "view" && (
            <div className="row-actions">
              <button className="link-button" type="button" onClick={() => setMode("rename")}>
                Rename
              </button>
              <button className="link-button" type="button" onClick={() => setMode("delete")}>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      {mode === "delete" && (
        <div className="confirm-inline">
          <span className="confirm-text">
            {bookings > 0
              ? `Deletes the campaign and its ${bookings} closed ${bookings === 1 ? "booking" : "bookings"}; their figures leave your reports.`
              : "Delete this empty campaign?"}
          </span>
          <button className="button button-danger" type="button" disabled={busy} onClick={() => run(() => deleteCampaign({ campaignId: id }))}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button className="button button-quiet" type="button" disabled={busy} onClick={() => { setMode("view"); setError(""); }}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
