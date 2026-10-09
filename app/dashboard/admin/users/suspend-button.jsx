"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSuspended } from "../actions";

export default function SuspendButton({ accountId, suspended, disabled }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const result = await setSuspended({ accountId, suspended: !suspended }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <button className={suspended ? "button" : "button button-quiet"} type="button" disabled={disabled || busy} onClick={toggle}>
        {busy ? "Saving…" : suspended ? "Reinstate" : "Suspend"}
      </button>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
