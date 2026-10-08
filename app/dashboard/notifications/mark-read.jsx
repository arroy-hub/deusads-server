"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markAllRead } from "./actions";

export default function MarkRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    await markAllRead().catch(() => null);
    setBusy(false);
    router.refresh();
  }

  return (
    <button className="button button-quiet" type="button" onClick={run} disabled={busy}>
      {busy ? "Saving…" : "Mark all as read"}
    </button>
  );
}
