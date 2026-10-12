"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { categoryLabel } from "../../lib/categories";
import { cancelBooking } from "./advertising/actions";

/**
 * One booking. `view` says who is looking: the advertiser can withdraw it and sees what the developer
 * paused or blocked in that game (`booking.controlNote`); an admin only reads.
 */
export default function BookingRow({ booking, view }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canCancel = view === "advertiser" && (booking.status === "pending" || booking.status === "approved");

  async function run(action) {
    setBusy(true);
    setError("");
    const result = await action().catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

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
        {view === "advertiser" && booking.controlNote && <div className="muted-line"><strong>{booking.controlNote}</strong></div>}
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
        {canCancel && (
          <button className="button button-quiet" type="button" disabled={busy} onClick={cancel}>
            {busy ? "Saving…" : booking.status === "approved" ? "Stop campaign" : "Withdraw"}
          </button>
        )}
      </td>
    </tr>
  );
}
