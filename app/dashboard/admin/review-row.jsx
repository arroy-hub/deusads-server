"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewAsset, reviewCreative } from "./actions";

/** One creative in the moderation lists: preview, owner, and the decision buttons. */
export default function ReviewRow({ creative, canNote }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision) {
    setBusy(true);
    setError("");
    const act = creative.kind === "asset" ? () => reviewAsset({ assetId: creative.id, decision, note }) : () => reviewCreative({ creativeId: creative.id, decision, note });
    const result = await act().catch(() => ({
      error: "Connection lost. Try again.",
    }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setRejecting(false);
    setNote("");
    router.refresh();
  }

  return (
    <tr>
      <td className="thumb-cell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="thumb" src={creative.url} alt="" loading="lazy" width="64" height="40" />
      </td>
      <td>
        <div className="creative-name">{creative.name}</div>
        <div className="muted-line">
          {creative.owner}
          {creative.email && creative.owner !== creative.email ? ` · ${creative.email}` : ""} ·{" "}
          {creative.size} · {creative.created}
        </div>
        {creative.status === "rejected" && creative.note && (
          <div className="muted-line">Reason: {creative.note}</div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </td>
      <td>{creative.status}</td>
      <td className="actions-cell">
        {rejecting ? (
          <div className="confirm-inline">
            {canNote && (
              <input
                className="field"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Reason (shown to the owner)"
                aria-label="Reason for rejecting"
                maxLength={500}
                disabled={busy}
              />
            )}
            <button className="button button-danger" type="button" disabled={busy} onClick={() => decide("rejected")}>
              {busy ? "Saving…" : "Reject"}
            </button>
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="confirm-inline">
            {creative.status !== "approved" && (
              <button className="button" type="button" disabled={busy} onClick={() => decide("approved")}>
                {busy ? "Saving…" : "Approve"}
              </button>
            )}
            {creative.status !== "rejected" && (
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(true)}>
                Reject…
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
