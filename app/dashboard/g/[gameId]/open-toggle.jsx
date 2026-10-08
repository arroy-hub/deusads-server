"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPlacementOpen } from "../../actions";

/** "Open to advertisers" switch for one placement; saves as soon as it is clicked. */
export default function OpenToggle({ placementId, initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(event) {
    const next = event.target.checked;
    setBusy(true);
    setError("");
    setOpen(next);
    const result = await setPlacementOpen({ placementId, open: next }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) {
      setOpen(!next);
      return setError(result.error);
    }
    router.refresh();
  }

  return (
    <div>
      <label className="open-toggle">
        <input type="checkbox" checked={open} onChange={change} disabled={busy} />
        <span>{open ? "Open to advertisers" : "Closed"}</span>
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
