"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideBooking, stopBooking } from "./bookings-actions";
import { cancelBooking } from "./advertising/actions";

/**
 * One booking. `view` says who is looking: the advertiser can withdraw it, the
 * developer and an admin can approve or reject their side while it is pending.
 */
export default function BookingRow({ booking, view }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const side = view === "admin" ? "admin" : view === "developer" ? "developer" : null;
  const mine = side === "admin" ? booking.admin : side === "developer" ? booking.developer : null;
  const canDecide = side && booking.status === "pending" && mine === "pending";
  const canCancel = view === "advertiser" && (booking.status === "pending" || booking.status === "approved");

  const canStop = view === "developer" && booking.status === "approved";

  async function run(action) {
    setBusy(true);
    setError("");
    const result = await action().catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setRejecting(false);
    setNote("");
    router.refresh();
  }

  const decide = (decision) => run(() => decideBooking({ bookingId: booking.id, side, decision, note }));
  const stop = () => run(() => stopBooking({ bookingId: booking.id, note }));
  const cancel = () => run(() => cancelBooking({ bookingId: booking.id }));

  return (
    <tr>
      <td className="thumb-cell">
        {booking.creativeUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="thumb" src={booking.creativeUrl} alt="" loading="lazy" width="64" height="40" />
        )}
      </td>
      <td>
        <div className="creative-name">
          {booking.game} · {booking.placement}
        </div>
        <div className="muted-line">
          {view !== "advertiser" && <>{booking.advertiser} · </>}
          {view === "admin" && <>{booking.developerName} · </>}
          {booking.creativeName}
          {booking.creativeSize ? ` (${booking.creativeSize})` : ""}
          {booking.scene ? ` · scene ${booking.scene}` : ""} · {booking.campaign} · {booking.created}
          {booking.dates ? ` · ${booking.dates}` : ""}
        </div>
        {booking.fit && <div className="muted-line">{booking.fit}</div>}
        {booking.status === "rejected" && booking.note && <div className="muted-line">Reason: {booking.note}</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </td>
      <td>{booking.label}</td>
      <td className="actions-cell">
        {canDecide &&
          (rejecting ? (
            <div className="confirm-inline">
              <input
                className="field"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Reason (shown to the advertiser)"
                aria-label="Reason for rejecting"
                maxLength={500}
                disabled={busy}
              />
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
        {canStop &&
          (rejecting ? (
            <div className="confirm-inline">
              <input
                className="field"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Reason (shown to the advertiser)"
                aria-label="Reason for stopping"
                maxLength={500}
                disabled={busy}
              />
              <button className="button button-danger" type="button" disabled={busy} onClick={stop}>
                {busy ? "Saving…" : "Stop"}
              </button>
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(true)}>
              Stop showing…
            </button>
          ))}
        {canCancel && (
          <button className="button button-quiet" type="button" disabled={busy} onClick={cancel}>
            {busy ? "Saving…" : booking.status === "approved" ? "Stop campaign" : "Withdraw"}
          </button>
        )}
      </td>
    </tr>
  );
}
