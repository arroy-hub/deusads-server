"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute } from "../actions";

/** One report: the creative, where it was reported, why, and (while open) the two decisions. */
export default function DisputeRow({ item }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision) {
    if (decision === "remove" && !window.confirm(`Remove the creative "${item.creative}" from the platform? Bookings are not changed.`)) return;
    setBusy(true);
    setError("");
    const result = await resolveDispute({ disputeId: item.id, decision }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <tr>
      <td className="thumb-cell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.url && <img className="thumb" src={item.url} alt="" loading="lazy" width="64" height="40" />}
      </td>
      <td>
        <div className="creative-name">{item.creative}</div>
        <div className="muted-line">{item.advertiser} · {item.campaign} · Category: {item.category}</div>
        <div className="muted-line">Reported in {item.game} by {item.developer} · {item.when}</div>
        <div className="muted-line"><strong>{item.reason}</strong>{item.comment ? ` — ${item.comment}` : ""}</div>
        {item.outcome && <div className="muted-line">{item.outcome}</div>}
        {error && <div className="error" role="alert">{error}</div>}
      </td>
      <td>{item.open ? "Open" : "Resolved"}</td>
      <td className="actions-cell">
        {item.open && (
          <div className="confirm-inline">
            <button className="button button-danger" type="button" disabled={busy} onClick={() => decide("remove")}>Remove creative</button>
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => decide("dismiss")}>Dismiss report</button>
          </div>
        )}
      </td>
    </tr>
  );
}
