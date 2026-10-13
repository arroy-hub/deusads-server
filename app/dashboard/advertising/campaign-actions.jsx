"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { duplicateCampaign, pauseCampaign } from "./actions";

/** Pause or resume a whole campaign: its ads stop (or start again) in every game at the next manifest. */
export function PauseButton({ id, paused, small = false, full = false, onDone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const result = await pauseCampaign({ campaignId: id, paused: !paused }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    onDone?.();
    router.refresh();
  }

  return (
    <>
      <button type="button" className={`button button-quiet${small ? " button-small" : ""}`} disabled={busy} onClick={toggle}>
        {busy ? "…" : `${paused ? "Resume" : "Pause"}${full ? " campaign" : ""}`}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}

/** Copy a campaign as a draft (same creative, placements and audience, no dates) and open it in the wizard. */
export function DuplicateButton({ id, small = false, as = "button", onDone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function copy() {
    setBusy(true);
    setError("");
    const result = await duplicateCampaign({ campaignId: id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    onDone?.();
    router.push(`/dashboard/advertising/new?campaign=${result.campaignId}`);
  }

  return (
    <>
      <button type="button" role={as === "menuitem" ? "menuitem" : undefined} className={as === "menuitem" ? "cl-menu-action" : `button button-quiet${small ? " button-small" : ""}`} disabled={busy} onClick={copy}>
        {busy ? "Copying…" : "Duplicate"}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
