"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideApplication } from "../actions";

/** One advertiser application: who, what they say, and the decision. */
export default function ApplicationRow({ application, decided }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision) {
    setBusy(true);
    setError("");
    const result = await decideApplication({ requestId: application.id, decision, note }).catch(() => ({
      error: "Connection lost. Try again.",
    }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <tr>
      <td>
        <div className="creative-name">{application.company}</div>
        <div className="muted-line">
          {application.email} · {application.created}
        </div>
        {application.message && <div className="muted-line">“{application.message}”</div>}
        {decided && application.note && <div className="muted-line">Reason: {application.note}</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </td>
      <td>{application.status}</td>
      <td className="actions-cell">
        {!decided &&
          (rejecting ? (
            <div className="confirm-inline">
              <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason (shown to the applicant)" aria-label="Reason for rejecting" maxLength={500} disabled={busy} />
              <button className="button button-danger" type="button" disabled={busy} onClick={() => decide("rejected")}>
                {busy ? "Saving…" : "Reject"}
              </button>
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="confirm-inline">
              <button className="button" type="button" disabled={busy} onClick={() => decide("approved")}>
                {busy ? "Saving…" : "Approve"}
              </button>
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(true)}>
                Reject…
              </button>
            </div>
          ))}
      </td>
    </tr>
  );
}
