"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyAsAdvertiser } from "./actions";

export default function ApplicationForm() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await applyAsAdvertiser({ company, message }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <label htmlFor="company">Company or brand</label>
      <input id="company" className="field" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={120} required disabled={busy} />

      <label htmlFor="message">What do you want to advertise? (optional)</label>
      <textarea id="message" className="field" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} disabled={busy} />

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={busy || company.trim().length < 2}>
          {busy ? "Sending…" : "Send application"}
        </button>
      </div>
    </form>
  );
}
