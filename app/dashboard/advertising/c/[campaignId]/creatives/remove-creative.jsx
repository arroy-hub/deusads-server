"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeCreativeFromCampaign } from "../../../actions";

/** Takes one creative out of this campaign (asks first, since its live bookings stop). */
export default function RemoveCreative({ campaignId, creativeId, name, open }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    const result = await removeCreativeFromCampaign({ campaignId, creativeId }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  if (open === 0) return null;
  if (!asking) {
    return (
      <button type="button" className="link-button" onClick={() => setAsking(true)} aria-label={`Remove ${name} from this campaign`}>
        Remove
      </button>
    );
  }
  return (
    <span className="confirm-inline">
      <span className="confirm-text">Stops its {open} {open === 1 ? "booking" : "bookings"} here.</span>
      <button type="button" className="button button-danger button-small" disabled={busy} onClick={run}>
        {busy ? "Removing…" : "Remove"}
      </button>
      <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => setAsking(false)}>
        Keep
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </span>
  );
}
