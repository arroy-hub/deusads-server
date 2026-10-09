"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { blockAds, stopBooking } from "./bookings-actions";
import { categoryLabel } from "../../lib/categories";
import { cancelBooking } from "./advertising/actions";

/**
 * One booking. `view` says who is looking: the advertiser can withdraw it, the
 * developer can stop it or block the advertiser / the category, an admin only reads.
 */
export default function BookingRow({ booking, view }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canCancel = view === "advertiser" && (booking.status === "pending" || booking.status === "approved");

  const canStop = view === "developer" && booking.status === "approved";
  const [blocking, setBlocking] = useState(null); // null | "advertiser" | "category" | "creative"

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

  const block = (kind) =>
    run(() => blockAds({ kind, target: kind === "advertiser" ? booking.advertiserId : kind === "creative" ? booking.creativeId : booking.category })).then(() => setBlocking(null));
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
          {booking.creativeName} · {categoryLabel(booking.category)}
          {booking.creativeSize ? ` (${booking.creativeSize})` : ""}
          {booking.scene ? ` · scene ${booking.scene}` : ""} · {booking.campaign} · {booking.created}
          {booking.dates ? ` · ${booking.dates}` : ""}
        </div>
        {booking.fit && <div className="muted-line">{booking.fit}</div>}
        {booking.audienceNote && <div className="muted-line">{booking.audienceNote}</div>}
        {booking.status === "rejected" && booking.note && <div className="muted-line">Reason: {booking.note}</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </td>
      <td>{booking.label}</td>
      <td className="actions-cell">
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
            <div className="confirm-inline">
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => setRejecting(true)}>
                Stop showing…
              </button>
              {blocking ? (
                <>
                  <button className="button button-danger" type="button" disabled={busy} onClick={() => block(blocking)}>
                    {busy ? "Saving…" : `Block ${blocking === "advertiser" ? booking.advertiser : blocking === "creative" ? "this creative" : categoryLabel(booking.category)}`}
                  </button>
                  <button className="button button-quiet" type="button" disabled={busy} onClick={() => setBlocking(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="button button-quiet" type="button" disabled={busy} onClick={() => setBlocking("creative")}>
                    Block creative…
                  </button>
                  <button className="button button-quiet" type="button" disabled={busy} onClick={() => setBlocking("advertiser")}>
                    Block advertiser…
                  </button>
                  <button className="button button-quiet" type="button" disabled={busy} onClick={() => setBlocking("category")}>
                    Block category…
                  </button>
                </>
              )}
            </div>
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
