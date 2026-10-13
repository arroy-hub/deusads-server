"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { excludeGame } from "../../actions";

/** Take a game out of the campaign (its placements stay booked) or bring it back. */
export default function ExcludeButton({ campaignId, gameId, excluded }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const result = await excludeGame({ campaignId, gameId, excluded: !excluded }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="button button-quiet button-small" disabled={busy} onClick={toggle}>
        {busy ? "…" : excluded ? "Show here again" : "Exclude"}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
